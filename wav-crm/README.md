# WAV CRM

ملف واحد `index.html`. بدون إعداد يشتغل **محليًا** (البيانات في المتصفح). لتشغيله لكل الفريق على نفس البيانات:

1. https://console.firebase.google.com ← **Add project**.
2. **Build → Authentication → Get started → Email/Password → Enable**. بعدين تبويب **Users → Add user** وأضف إيميل وكلمة سر لكل موظف (مفيش تسجيل ذاتي).
3. **Build → Firestore Database → Create database** (Production mode)، وبعدين تبويب **Rules** والصق محتوى `firestore.rules` واضغط **Publish**.
4. **Project settings (⚙️) → General → Your apps → Web (`</>`)** وانسخ كائن `firebaseConfig`.
5. افتح `index.html` وحط الكائن مكان `const FIREBASE_CONFIG=null;`.
6. استضيفه (GitHub Pages / Firebase Hosting / Netlify) أو افتحه مباشرة.
7. **Authentication → Settings → Authorized domains**: أضف الدومين اللي هتستضيف عليه.

البيانات الموجودة محليًا ممكن تنزلها من **الإعدادات → تنزيل** قبل التحويل، وتسترجعها بعد الدخول.

## الصلاحيات

من شاشة **الفريق** حدد لكل موظف *إيميل الدخول* (نفس إيميل حساب Firebase) و*الصلاحية*:

| الصلاحية | بتشوف |
|---|---|
| مدير | كل حاجة |
| مبيعات | الداشبورد، ليدزه هو بس، العملاء، الفواتير، المهام |
| تنفيذ | الداشبورد، العملاء، المشاريع، المهام، كالندر المحتوى |
| محاسب | الداشبورد، العملاء، الفواتير، الاشتراكات، المصروفات، التقارير |

أول ما يتحط إيميل لأي موظف بيتفعّل التقييد. أي حساب إيميله مش مسجّل في الفريق بياخد صلاحية "تنفيذ".
⚠️ التقييد في الواجهة فقط؛ قواعد Firestore الحالية بتسمح لأي مسجّل دخول بالقراءة والكتابة.

## النشر على Vercel

الـ repo فيه نظامين: الـ CRM القديم (EgyGulf) في الجذر، و WAV في فولدر `wav-crm`. عشان WAV يبقى له رابط مستقل:

1. ادمج الـ PR في `main` على GitHub.
2. في Vercel: **Add New → Project** ← اختار نفس الـ repo (`crmegy`).
3. **Root Directory = `wav-crm`**، و Framework Preset = *Other*، وسيب Build Command فاضي.
4. **Deploy** — هتاخد رابط مثل `wav-crm-xxxx.vercel.app` (وتقدر تربط دومين من **Settings → Domains**).
5. بعد ما تفعّل Firebase: **Firebase Console → Authentication → Settings → Authorized domains** ← أضف دومين Vercel، وإلا تسجيل الدخول مش هيشتغل.

أي push على `main` بعد كده بينشر تلقائي. (مشروع Vercel الحالي `crmegy` بيخدم الـ EgyGulf من الجذر؛ WAV عليه بيظهر تحت `/wav-crm/` بس.)
