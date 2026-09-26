# إضافة التقارير — Apps Script

الملف `ReportsAddon.gs` بيضيف للـ backend:

| الحاجة | التفاصيل |
|---|---|
| شيتات جديدة (بتتعمل أوتوماتيك) | `Activities`, `StatusHistory`, `Targets`, `WeeklySnapshots`, `Settings` |
| أعمدة جديدة في آخر شيتات الليدز | `lastActivityAt`, `lostReason`, `quantity`, `assignedAt` (بتتضاف أوتوماتيك وبتتقري بالاسم) |
| GET action | `getReportData` |
| POST actions | `addActivity`, `addStatusHistory`, `setLeadExtra`, `setTarget`, `saveSnapshots`, `setSetting` |

مفيش أي عمود أو شيت قديم بيتمسح أو بيتغير اسمه أو ترتيبه.

## الطريقة الأسهل: استبدال Code.gs (موصى بيها)

`Code.gs` هنا = الكود بتاعكم زي ما هو بالظبط + سطر في أول `doGet` + سطر في أول `doPost` + الإضافة في آخر الملف.

1. افتح مشروع Apps Script، امسح كل محتوى `Code.gs` والصق محتوى `apps-script/Code.gs` كله.
2. **Save**، وبعدين **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.
3. أول مرة ممكن يطلب صلاحيات: **Review permissions → Allow**.

⚠️ في الطريقة دي **متضيفش** ملف `ReportsAddon.gs` كمان — الإضافة موجودة جوه `Code.gs` خلاص.

## الطريقة التانية: ملف منفصل



1. افتح مشروع Apps Script بتاع الـ CRM (من الشيت: **Extensions → Apps Script**).
2. من الشمال: **Files → + → Script**، وسمّيه `ReportsAddon`، والصق فيه محتوى `ReportsAddon.gs` كله.
3. الإضافة بتستخدم `SHEET_ID` اللي في `Code.gs` أوتوماتيك، فمش محتاج تغيّر `RA_SPREADSHEET_ID`.
4. اتأكد إن أسماء شيتات الليدز مطابقة لـ `RA_LEAD_SHEETS` (الافتراضي `Leads` و`Leads_Cairo`).
5. في `Code.gs` ضيف سطر في **أول** `doGet` وسطر في **أول** `doPost`:

   ```js
   function doGet(e) {
     var ra = raHandleGet(e); if (ra) return ra;   // ← السطر الجديد
     // ... الكود القديم زي ما هو
   }

   function doPost(e) {
     var ra = raHandlePost(e); if (ra) return ra;  // ← السطر الجديد
     // ... الكود القديم زي ما هو
   }
   ```

   الدالتين بيرجعوا `null` لأي action مش بتاعهم، فالكود القديم بيكمل عادي.
6. **Save**، وبعدين **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.
   (كده الـ URL بيفضل زي ما هو ومش محتاج تغيّر حاجة في `index.html`.)
7. أول مرة ممكن يطلب صلاحيات: **Review permissions → Allow**.

## التأكد إنه اشتغل

افتح في المتصفح:

```
<GS_URL>?action=getReportData
```

المفروض يرجع JSON فيه `"ok":true,"addon":"1"`، وتلاقي الشيتات الجديدة اتعملت في الـ Spreadsheet.

لو الإضافة مش متركبة، الـ CRM بيشتغل عادي، والتقرير بيعرض تنبيه إن الأرقام تقديرية.
