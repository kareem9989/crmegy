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
