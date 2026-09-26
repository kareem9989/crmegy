/**
 * EgyGulf CRM — Reports Add-on (Activities / StatusHistory / Targets / WeeklySnapshots / Settings)
 * ---------------------------------------------------------------------------------------------
 * ملف إضافي بيتحط جنب Code.gs في نفس مشروع Apps Script. مش بيعدّل أي عمود أو شيت موجود:
 *  - بيعمل الشيتات الجديدة أوتوماتيك لو مش موجودة.
 *  - بيضيف أعمدة جديدة في آخر شيتات الليدز (lastActivityAt, lostReason, quantity, assignedAt)
 *    ويدوّر عليها بالاسم من صف الـ header، فمش بيعتمد على ترتيب الأعمدة.
 *
 * التركيب: في doGet(e) و doPost(e) الموجودين في Code.gs ضيف سطر واحد في أول كل دالة:
 *
 *   function doGet(e) {
 *     var ra = raHandleGet(e); if (ra) return ra;
 *     ... الكود القديم زي ما هو ...
 *   }
 *   function doPost(e) {
 *     var ra = raHandlePost(e); if (ra) return ra;
 *     ... الكود القديم زي ما هو ...
 *   }
 *
 * وبعدين Deploy > Manage deployments > Edit > Version: New version > Deploy (نفس الـ URL).
 */

// لو السكريبت مش مربوط بالشيت (standalone) حط الـ Spreadsheet ID هنا، غير كده سيبه فاضي
var RA_SPREADSHEET_ID = '';
// أسماء شيتات الليدز لكل فرع
var RA_LEAD_SHEETS = { tanta: ['Leads'], cairo: ['Leads_Cairo', 'LeadsCairo', 'Leads Cairo'] };
var RA_VERSION = '1';

var RA_SHEETS = {
  Activities:      ['id', 'leadId', 'empId', 'empName', 'type', 'at', 'note', 'team'],
  StatusHistory:   ['id', 'leadId', 'from', 'to', 'at', 'byId', 'byName', 'team'],
  Targets:         ['empId', 'contacts', 'interested', 'quotes', 'updatedAt'],
  WeeklySnapshots: ['weekStart', 'empId', 'team', 'dataJson', 'approvedBy', 'approvedAt'],
  Settings:        ['key', 'value']
};
var RA_LEAD_EXTRA_COLS = ['lastActivityAt', 'lostReason', 'quantity', 'assignedAt'];

// ═══ ENTRY POINTS ═══
function raHandleGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action !== 'getReportData') return null;
  var data;
  try { data = raGetReportData(); } catch (err) { data = { ok: false, error: String(err) }; }
  return raJsonp(p.callback, data);
}

function raHandlePost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return null; }
  if (!body || !body.action) return null;
  var handlers = {
    addActivity: raAddActivity,
    addStatusHistory: raAddStatusHistory,
    setLeadExtra: raSetLeadExtra,
    setTarget: raSetTarget,
    saveSnapshots: raSaveSnapshots,
    setSetting: raSetSetting
  };
  var fn = handlers[body.action];
  if (!fn) return null; // مش action بتاعنا — سيب Code.gs يتعامل معاه
  var lock = LockService.getScriptLock();
  var result;
  try {
    lock.waitLock(25000);
    fn(body);
    result = { ok: true };
  } catch (err) {
    result = { ok: false, error: String(err) };
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// ═══ READ ═══
function raGetReportData() {
  var ss = raSS();
  var out = { ok: true, addon: RA_VERSION, activities: [], statusHistory: [], targets: [], snapshots: [], settings: [], leadExtras: {} };
  out.activities = raReadRows(raEnsureSheet(ss, 'Activities'));
  out.statusHistory = raReadRows(raEnsureSheet(ss, 'StatusHistory'));
  out.targets = raReadRows(raEnsureSheet(ss, 'Targets'));
  out.snapshots = raReadRows(raEnsureSheet(ss, 'WeeklySnapshots'));
  out.settings = raReadRows(raEnsureSheet(ss, 'Settings'));
  ['tanta', 'cairo'].forEach(function (branch) {
    var sh = raLeadSheet(ss, branch);
    if (!sh || sh.getLastRow() < 2) return;
    var cols = raEnsureLeadCols(sh);
    var lastCol = sh.getLastColumn();
    var values = sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getValues();
    for (var i = 0; i < values.length; i++) {
      var id = String(values[i][0] || '');
      if (!id) continue;
      var ex = {}, any = false;
      RA_LEAD_EXTRA_COLS.forEach(function (name) {
        var v = raCell(values[i][cols[name] - 1]);
        if (v !== '') { ex[name] = v; any = true; }
      });
      if (any) out.leadExtras[id] = ex;
    }
  });
  return out;
}

// ═══ WRITE ═══
function raAddActivity(b) {
  var r = b.row || [];
  raAppend(raEnsureSheet(raSS(), 'Activities'), r);
  // row: [id, leadId, empId, empName, type, at, note, team]
  raPatchLead(b.branch || r[7], r[1], { lastActivityAt: r[5] });
}

function raAddStatusHistory(b) {
  var r = b.row || [];
  raAppend(raEnsureSheet(raSS(), 'StatusHistory'), r);
  // row: [id, leadId, from, to, at, byId, byName, team]
  raPatchLead(b.branch || r[7], r[1], { lastActivityAt: r[4] });
}

function raSetLeadExtra(b) {
  raPatchLead(b.branch, b.id, b.fields || {});
}

function raSetTarget(b) {
  var r = b.row || []; // [empId, contacts, interested, quotes, updatedAt]
  raUpsert(raEnsureSheet(raSS(), 'Targets'), function (row) { return String(row[0]) === String(r[0]); }, r);
}

function raSaveSnapshots(b) {
  var sh = raEnsureSheet(raSS(), 'WeeklySnapshots');
  (b.rows || []).forEach(function (r) { // [weekStart, empId, team, dataJson, approvedBy, approvedAt]
    raUpsert(sh, function (row) { return raCell(row[0]) === String(r[0]) && String(row[1]) === String(r[1]); }, r);
  });
}

function raSetSetting(b) {
  raUpsert(raEnsureSheet(raSS(), 'Settings'), function (row) { return String(row[0]) === String(b.key); }, [b.key, String(b.value)]);
}

// ═══ HELPERS ═══
function raSS() {
  return RA_SPREADSHEET_ID ? SpreadsheetApp.openById(RA_SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function raEnsureSheet(ss, name) {
  var headers = RA_SHEETS[name];
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    // نص عادي عشان Sheets ميحولش التواريخ لـ Date ويغيّر شكلها
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
}

function raLeadSheet(ss, branch) {
  var names = RA_LEAD_SHEETS[branch === 'cairo' ? 'cairo' : 'tanta'];
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (sh) return sh;
  }
  return null;
}

// بيرجع {اسم العمود: رقمه} للأعمدة الجديدة، وبيضيفها في آخر الشيت لو مش موجودة
function raEnsureLeadCols(sh) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var map = {};
  RA_LEAD_EXTRA_COLS.forEach(function (name) {
    var idx = header.indexOf(name);
    if (idx < 0) {
      lastCol += 1;
      sh.getRange(1, lastCol).setValue(name).setFontWeight('bold');
      sh.getRange(1, lastCol, sh.getMaxRows(), 1).setNumberFormat('@');
      header.push(name);
      idx = lastCol - 1;
    }
    map[name] = idx + 1;
  });
  return map;
}

function raPatchLead(branch, id, fields) {
  if (!id) return;
  var ss = raSS();
  var sh = raLeadSheet(ss, branch);
  if (!sh) return;
  var cols = raEnsureLeadCols(sh);
  // appendLead ممكن يكون لسه بيتنفذ في نفس اللحظة — نحاول كذا مرة
  var row = 0;
  for (var attempt = 0; attempt < 4 && !row; attempt++) {
    if (attempt) { SpreadsheetApp.flush(); Utilities.sleep(1500); }
    var found = sh.getRange(1, 1, sh.getLastRow(), 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
    if (found) row = found.getRow();
  }
  if (!row || row < 2) return;
  Object.keys(fields).forEach(function (name) {
    if (!cols[name]) return;
    var v = fields[name];
    sh.getRange(row, cols[name]).setValue(v === null || v === undefined ? '' : String(v));
  });
}

function raAppend(sh, row) {
  sh.appendRow(row.map(function (v) { return v === null || v === undefined ? '' : String(v); }));
}

function raUpsert(sh, match, row) {
  var clean = row.map(function (v) { return v === null || v === undefined ? '' : String(v); });
  var last = sh.getLastRow();
  if (last >= 2) {
    var values = sh.getRange(2, 1, last - 1, clean.length).getValues();
    for (var i = 0; i < values.length; i++) {
      if (match(values[i])) { sh.getRange(i + 2, 1, 1, clean.length).setValues([clean]); return; }
    }
  }
  sh.appendRow(clean);
}

function raReadRows(sh) {
  var last = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (last < 2 || lastCol < 1) return [];
  return sh.getRange(2, 1, last - 1, lastCol).getValues()
    .filter(function (r) { return r[0] !== '' && r[0] !== null; })
    .map(function (r) { return r.map(raCell); });
}

var _raTz = null;
function raCell(v) {
  if (v instanceof Date) {
    var tz = _raTz || (_raTz = raSS().getSpreadsheetTimeZone());
    var hms = Utilities.formatDate(v, tz, 'HH:mm:ss');
    return hms === '00:00:00' ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v.toISOString();
  }
  return v === null || v === undefined ? '' : String(v);
}

function raJsonp(callback, data) {
  var json = JSON.stringify(data);
  if (callback && /^[\w$.]+$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
