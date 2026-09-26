const SHEET_ID = '1CWuACOmI4vYkuf3brZ3h1JTudQp0xrpzOH1t1km7evU';
const SHEETS = { LEADS:'Leads', LEADS_CAIRO:'Leads_Cairo', EMPLOYEES:'Employees', PAIRS:'Pairs', INVOICES:'Invoices', VISITS:'Visits', COMMENTS:'Comments', RECRUITERS:'Recruiters', ATTENDANCE:'Attendance' };
const HEADERS = { LEADS:['ID','Name','Company','Phone','Phone2','WhatsApp','Email','Country','City','BType','Product','Source','SocialEmp','SalesEmp','Status','Response','Priority','Deal','Notes','Followup','Samples','SampleResult','Added','Updated'], LEADS_CAIRO:['ID','Name','Company','Phone','Phone2','WhatsApp','Email','Country','City','BType','Product','Source','SocialEmp','SalesEmp','Status','Response','Priority','Deal','Notes','Followup','Samples','SampleResult','Added','Updated'], EMPLOYEES:['ID','Name','Email','Password','Role','Team','Phone','Color','Status','Title'], PAIRS:['ID','SocialID','SalesID','Date'], INVOICES:['ID','LeadID','LeadName','RequestedBy','RequestedByID','RequestText','PDFUrl','Status','Date','AdminNote','Kind','InvoiceNumber','SalesEmpName','SocialEmpName','Total','ClientJson','ItemsJson'], VISITS:['ID','LeadID','LeadName','VisitDate','Visited','AddedBy','Date'], COMMENTS:['ID','LeadID','AuthorID','AuthorName','Text','Date'], RECRUITERS:['ID','Name','Phone','Job','English','Qualification','ContactStatus','AddedBy','Added','CvUrl','CvName','Experience','Governorate','GradYear','College','Notes'], ATTENDANCE:['ID','EmpID','EmpName','Date','Time','Branch','Lat','Lng','MapLink'] };

// اسم الـ folder في Drive اللي هيتحفظ فيه الـ CVs
const CV_FOLDER_NAME = 'EgyGulf_CVs';

// مدة صلاحية الكاش بالثواني — رفعناها من 45 ثانية لـ 3 دقايق عشان تقلل عدد المرات
// اللي بنقرا فيها كل الشيتات بالكامل (اللي هي أكبر سبب للبطء)، من غير ما تخلي البيانات قديمة أوي
const CACHE_TTL_SEC = 180;
const CACHE_KEY_GETALL = 'getAll_v1';
// كاش سريع ومنفصل بس لشيت الموظفين — أخف بكتير من getAll الكامل، وبيتقرا فورًا
// عشان شاشة الدخول (اختيار اسم الموظف) متستناش تحميل كل البيانات التانية (Leads/Invoices/...)
const CACHE_TTL_EMPLOYEES_SEC = 300;
const CACHE_KEY_EMPLOYEES = 'employees_v1';

// اسم شيت الـ Leads حسب الفرع اللي جاي من الفرونت إند (branch: 'cairo' أو غير كده = طنطا)
function leadSheetName(branch) {
  return branch === 'cairo' ? SHEETS.LEADS_CAIRO : SHEETS.LEADS;
}

function ensureSheets(ss) {
  Object.keys(SHEETS).forEach(key => {
    const name = SHEETS[key];
    let sheet = ss.getSheetByName(name);
    if (!sheet) { sheet = ss.insertSheet(name); sheet.appendRow(HEADERS[key]); }
    else if (sheet.getLastRow() === 0) { sheet.appendRow(HEADERS[key]); }
  });
}

// شغّلها يدوي مرة واحدة بس من محرر الـ Apps Script (اختار الدالة دي من القائمة واضغط Run)
// عشان تتأكد إن كل الشيتات (بما فيها Leads_Cairo و Attendance) والـ Headers موجودين.
function setupSheetsOnce() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureSheets(ss);
}

// شغّلها مرة واحدة لو شيت Attendance كان موجود قبل كده من غير عمودي Lat/Lng أو عمود MapLink
function migrateAttendanceHeaderOnce() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const s = getSheet(ss, 'Attendance');
  const lastCol = s.getLastColumn();
  const wanted = HEADERS.ATTENDANCE;
  if (lastCol < wanted.length) {
    s.getRange(1, 1, 1, wanted.length).setValues([wanted]);
  }
  // يضيف لينك الخريطة لأي صفوف قديمة عندها Lat/Lng بس من غير لينك
  const lastRow = s.getLastRow();
  if (lastRow > 1) {
    const data = s.getRange(2, 1, lastRow - 1, 9).getValues();
    for (let i = 0; i < data.length; i++) {
      const lat = data[i][6], lng = data[i][7], existingLink = data[i][8];
      if (lat !== '' && lng !== '' && !existingLink) {
        s.getRange(i + 2, 9).setFormula('=HYPERLINK("https://www.google.com/maps?q=' + lat + ',' + lng + '","📍 خريطة")');
      }
    }
  }
}

// شغّلها مرة واحدة لو شيت Employees كان موجود قبل كده من غير عمود Title
function migrateEmployeesHeaderOnce() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const s = getSheet(ss, 'Employees');
  const lastCol = s.getLastColumn();
  const wanted = HEADERS.EMPLOYEES;
  if (lastCol < wanted.length) {
    s.getRange(1, 1, 1, wanted.length).setValues([wanted]);
  }
}

function migrateInvoicesHeaderOnce() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const s = getSheet(ss, 'Invoices');
  const lastCol = s.getLastColumn();
  const wanted = HEADERS.INVOICES;
  if (lastCol < wanted.length) {
    s.getRange(1, 1, 1, wanted.length).setValues([wanted]);
  }
}

// ═══ CV UPLOAD TO GOOGLE DRIVE ═══
function uploadCvToDrive(recruiterId, fileName, mimeType, base64Data) {
  let folder;
  const folders = DriveApp.getFoldersByName(CV_FOLDER_NAME);
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(CV_FOLDER_NAME);
  }

  const safeId = String(recruiterId || '');
  if (safeId) {
    const oldFiles = folder.searchFiles('title contains "' + safeId + '_"');
    while (oldFiles.hasNext()) { oldFiles.next().setTrashed(true); }
  }

  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    mimeType || 'application/pdf',
    (safeId ? safeId + '_' : '') + (fileName || 'CV.pdf')
  );
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileId = file.getId();
  return {
    url: 'https://drive.google.com/file/d/' + fileId + '/view?usp=sharing',
    fileId: fileId
  };
}

// بتمسح الكاش أول ما أي بيانات تتغير (append/update/delete)، عشان أول طلب getAll بعد التعديل يرجع محدث فوراً
function invalidateGetAllCache() {
  CacheService.getScriptCache().remove(CACHE_KEY_GETALL);
  CacheService.getScriptCache().remove(CACHE_KEY_EMPLOYEES);
}

// ═══ doGet ═══
function doGet(e) {
  // ⬇️ إضافة التقارير (getReportData) — لازم تفضل أول سطر
  var ra = raHandleGet(e); if (ra) return ra;
  const action = e.parameter.action || 'getAll';
  const cb = e.parameter.callback;
  let result = {};
  try {
    if (action === 'getAll') {
      const cache = CacheService.getScriptCache();
      const cached = cache.get(CACHE_KEY_GETALL);
      if (cached) {
        result = JSON.parse(cached);
      } else {
        const ss = SpreadsheetApp.openById(SHEET_ID);
        result = {
          leads:       getSheetData(ss, 'Leads'),
          leadsCairo:  getSheetData(ss, 'Leads_Cairo'),
          employees:   getSheetData(ss, 'Employees'),
          pairs:       getSheetData(ss, 'Pairs'),
          invoices:    getSheetData(ss, 'Invoices'),
          visits:      getSheetData(ss, 'Visits'),
          comments:    getSheetData(ss, 'Comments'),
          attendance:  getSheetData(ss, 'Attendance')
        };
        // الكاش محدود بـ 100KB لكل مفتاح — لو البيانات أكبر من كده، ال try/catch هيتجاهل الحفظ بس هيرجع النتيجة عادي
        try { cache.put(CACHE_KEY_GETALL, JSON.stringify(result), CACHE_TTL_SEC); } catch(cacheErr) {}
      }
    }
    if (action === 'getEmployees') {
      // خفيف وسريع — يستخدم عشان قائمة الموظفين في شاشة الدخول تظهر بسرعة من غير
      // ما تستنى تحميل كل الشيتات التانية (Leads/Invoices/Visits/...)
      const cache = CacheService.getScriptCache();
      const cached = cache.get(CACHE_KEY_EMPLOYEES);
      if (cached) {
        result = JSON.parse(cached);
      } else {
        const ss = SpreadsheetApp.openById(SHEET_ID);
        result = { employees: getSheetData(ss, 'Employees') };
        try { cache.put(CACHE_KEY_EMPLOYEES, JSON.stringify(result), CACHE_TTL_EMPLOYEES_SEC); } catch(cacheErr) {}
      }
    }
    if (action === 'getRecruiters') {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      result = { recruiters: getSheetData(ss, 'Recruiters') };
    }
    if (action === 'appendRecruiter') {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      getSheet(ss, 'Recruiters').appendRow(JSON.parse(e.parameter.row));
      invalidateGetAllCache();
      result = { ok: true };
    }
    if (action === 'updateRecruiter') {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const s = getSheet(ss, 'Recruiters');
      const d = s.getDataRange().getValues();
      for (let i = 1; i < d.length; i++) {
        if (String(d[i][0]) === String(e.parameter.id)) {
          s.getRange(i + 1, 7).setValue(e.parameter.value);
          break;
        }
      }
      invalidateGetAllCache();
      result = { ok: true };
    }
    if (action === 'deleteRecruiter') {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const s = getSheet(ss, 'Recruiters');
      const d = s.getDataRange().getValues();
      for (let i = d.length - 1; i >= 1; i--) {
        if (String(d[i][0]) === String(e.parameter.id)) {
          s.deleteRow(i + 1);
          break;
        }
      }
      invalidateGetAllCache();
      result = { ok: true };
    }
    if (action === 'uploadCvToDrive') {
      const driveRes = uploadCvToDrive(
        e.parameter.recruiterId,
        e.parameter.fileName,
        e.parameter.mimeType,
        e.parameter.base64Data
      );
      result = { ok: true, url: driveRes.url, fileId: driveRes.fileId };
    }
  } catch(err) {
    result = { error: err.message };
  }
  const output = cb ? cb + '(' + JSON.stringify(result) + ')' : JSON.stringify(result);
  const mime   = cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(output).setMimeType(mime);
}

// ═══ doPost ═══
function doPost(e) {
  // ⬇️ إضافة التقارير (Activities/StatusHistory/Targets/Snapshots/Settings) — لازم تفضل أول سطر
  var ra = raHandlePost(e); if (ra) return ra;
  const body = JSON.parse(e.postData.contents);
  const ss   = SpreadsheetApp.openById(SHEET_ID);
  const action = body.action;
  try {
    // ─── Leads (branch: 'cairo' يكتب في Leads_Cairo، غير كده Leads العادي/طنطا) ───
    if      (action === 'appendLead')    getSheet(ss, leadSheetName(body.branch)).appendRow(body.row);
    else if (action === 'updateLead')    updateRowById(ss, leadSheetName(body.branch), body.id, body.row);
    else if (action === 'deleteLead')    deleteRowById(ss, leadSheetName(body.branch), body.id);

    // ─── Employees ───
    else if (action === 'appendEmployee') getSheet(ss, 'Employees').appendRow(body.row);
    else if (action === 'updateEmployee') updateRowById(ss, 'Employees', body.id, body.row);
    else if (action === 'deleteEmployee') deleteRowById(ss, 'Employees', body.id);

    // ─── Pairs ───
    else if (action === 'appendPair')    getSheet(ss, 'Pairs').appendRow(body.row);
    else if (action === 'deletePair')    deleteRowById(ss, 'Pairs', body.id);

    // ─── Attendance (تسجيل حضور الموظفين + الموقع الجغرافي) ───
    else if (action === 'appendAttendance') {
      const s = getSheet(ss, 'Attendance');
      s.appendRow(body.row);
      const lastRow = s.getLastRow();
      const lat = body.row[6], lng = body.row[7];
      if (lat !== '' && lng !== '' && lat !== null && lng !== null && lat !== undefined && lng !== undefined) {
        s.getRange(lastRow, 9).setFormula('=HYPERLINK("https://www.google.com/maps?q=' + lat + ',' + lng + '","📍 خريطة")');
      }
    }

    // ─── Invoices ───
    else if (action === 'requestInvoice') {
      getSheet(ss, 'Invoices').appendRow([
        body.id, body.leadId, body.leadName, body.requestedBy, body.requestedByID,
        body.requestText, '', 'pending', body.date, '',
        'request', '', '', '', '', '', ''
      ]);
    }
    else if (action === 'uploadInvoicePDF') {
      const s = getSheet(ss, 'Invoices');
      const d = s.getDataRange().getValues();
      for (let i = 1; i < d.length; i++) {
        if (String(d[i][0]) === String(body.id)) {
          s.getRange(i + 1, 7).setValue(body.pdfUrl);
          s.getRange(i + 1, 8).setValue('uploaded');
          s.getRange(i + 1, 10).setValue(body.adminNote || '');
          break;
        }
      }
    }
    else if (action === 'createInvoice') {
      getSheet(ss, 'Invoices').appendRow([
        body.id,
        body.leadId || '',
        body.leadName || '',
        body.requestedBy || '',
        body.requestedByID || '',
        body.requestText || '',
        body.pdfUrl || '',
        body.status || 'created',
        body.date || new Date().toISOString(),
        body.adminNote || '',
        body.kind || 'generated',
        body.invoiceNumber || '',
        body.salesEmpName || '',
        body.socialEmpName || '',
        body.total || 0,
        body.clientJson || '',
        body.itemsJson || ''
      ]);
    }

    // ─── Visits ───
    else if (action === 'setVisit') {
      const s = getSheet(ss, 'Visits');
      const d = s.getDataRange().getValues();
      let found = false;
      for (let i = 1; i < d.length; i++) {
        if (String(d[i][1]) === String(body.leadId)) {
          s.getRange(i + 1, 1, 1, 7).setValues([[d[i][0], body.leadId, body.leadName, body.visitDate, body.visited, body.addedBy, body.date]]);
          found = true;
          break;
        }
      }
      if (!found) s.appendRow([body.id, body.leadId, body.leadName, body.visitDate, body.visited, body.addedBy, body.date]);
    }

    // ─── Comments ───
    else if (action === 'addComment')    getSheet(ss, 'Comments').appendRow([body.id, body.leadId, body.authorId, body.authorName, body.text, body.date]);
    else if (action === 'deleteComment') deleteRowById(ss, 'Comments', body.id);

    // ─── Recruiters ───
    else if (action === 'appendRecruiter') {
      getSheet(ss, 'Recruiters').appendRow(body.row);
    }
    else if (action === 'updateRecruiterRow') {
      updateRowById(ss, 'Recruiters', body.id, body.row);
    }
    else if (action === 'deleteRecruiter') {
      deleteRowById(ss, 'Recruiters', body.id);
    }

    // ─── CV Upload to Google Drive ───
    else if (action === 'uploadCvToDrive') {
      const driveResult = uploadCvToDrive(
        body.recruiterId,
        body.fileName,
        body.mimeType,
        body.base64Data
      );
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, url: driveResult.url, fileId: driveResult.fileId }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (['appendLead','updateLead','deleteLead','appendEmployee','updateEmployee','deleteEmployee','appendPair','deletePair','requestInvoice','uploadInvoicePDF','createInvoice','setVisit','addComment','deleteComment','appendAttendance'].indexOf(action) !== -1) {
      invalidateGetAllCache();
    }

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══ Helpers ═══
function getSheet(ss, name) {
  const s = ss.getSheetByName(name);
  if (!s) throw new Error('Sheet not found: ' + name);
  return s;
}
function getSheetData(ss, name) {
  try {
    const s = ss.getSheetByName(name);
    if (!s || s.getLastRow() === 0) return [];
    return s.getDataRange().getValues();
  } catch(e) { return []; }
}
function updateRowById(ss, name, id, row) {
  const s = getSheet(ss, name);
  const d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]) === String(id)) {
      s.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return;
    }
  }
}
function deleteRowById(ss, name, id) {
  const s = getSheet(ss, name);
  const d = s.getDataRange().getValues();
  for (let i = d.length - 1; i >= 1; i--) {
    if (String(d[i][0]) === String(id)) {
      s.deleteRow(i + 1);
      return;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ═══ REPORTS ADD-ON — Activities / StatusHistory / Targets / WeeklySnapshots / Settings
// ═══ بيعمل الشيتات الجديدة أوتوماتيك، وبيضيف أعمدة lastActivityAt/lostReason/quantity/assignedAt
// ═══ في آخر شيتات الليدز (بالاسم مش بالترتيب). مش بيغيّر أي عمود أو شيت موجود.
// ═══════════════════════════════════════════════════════════════════════════

// سيبه فاضي لو Code.gs فيه SHEET_ID (هو كده عندكم). غير كده حط الـ Spreadsheet ID هنا
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
var _raSS = null;
function raSS() {
  if (_raSS) return _raSS;
  // بيستخدم SHEET_ID بتاع Code.gs لو موجود (السكريبت standalone)، أو RA_SPREADSHEET_ID، أو الشيت المفتوح
  var id = RA_SPREADSHEET_ID || (typeof SHEET_ID !== 'undefined' ? SHEET_ID : '');
  _raSS = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return _raSS;
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
