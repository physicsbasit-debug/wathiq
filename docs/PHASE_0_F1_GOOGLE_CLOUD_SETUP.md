# إعداد Google Cloud وGoogle Drive — Phase 0-F1

هذه التعليمات تُنفّذ من لوحات الويب فقط، دون طرفية.

## 1. إنشاء مشروع Google Cloud

1. افتح: `https://console.cloud.google.com/`
2. سجّل الدخول بحساب Google الذي سيملك مجلد واثق.
3. من أعلى الصفحة افتح قائمة المشاريع.
4. اختر **New Project**.
5. اكتب الاسم:
   - `wathiq-production`
6. اضغط **Create**.
7. تأكد أن المشروع الجديد هو المشروع المحدد أعلى الصفحة.

## 2. تفعيل Google Drive API

1. من القائمة اختر **APIs & Services**.
2. اختر **Library**.
3. ابحث عن:
   - `Google Drive API`
4. افتحه ثم اضغط **Enable**.

## 3. إعداد شاشة موافقة OAuth

قد تظهر الواجهة باسم **Google Auth Platform**.

1. افتح **Google Auth Platform** أو **OAuth consent screen**.
2. في **Branding**:
   - App name: `واثق`
   - User support email: بريدك
   - Developer contact email: بريدك
3. في **Audience** اختر **External**.
4. في مرحلة الاختبار أضف حساب Google نفسه ضمن **Test users**.
5. في **Data Access / Scopes** أضف النطاق:
   - `https://www.googleapis.com/auth/drive.file`

هذا النطاق يسمح لواثق بإدارة الملفات والمجلدات التي ينشئها التطبيق، وليس كل ملفات Drive.

## 4. إنشاء OAuth Client

1. افتح **Google Auth Platform → Clients**.
2. اضغط **Create Client**.
3. اختر:
   - Application type: `Web application`
4. Name:
   - `Wathiq Web`
5. في **Authorized JavaScript origins** أضف:
   - `https://physicsbasit-debug.github.io`
6. في **Authorized redirect URIs** أضف هذا الرابط حرفيًا:
   - `https://zmktjusbmsrodboicnzr.supabase.co/functions/v1/google-drive-oauth/callback`
7. اضغط **Create**.
8. انسخ واحفظ:
   - Client ID
   - Client Secret

لا تضع Client Secret في GitHub.

## 5. تنفيذ SQL في Supabase

1. افتح مشروع `wathiq-production` في Supabase.
2. اختر **SQL Editor**.
3. اضغط **New query**.
4. افتح الملف:
   - `supabase/phase_0_f1_google_drive.sql`
5. انسخ محتواه كاملًا والصقه.
6. اضغط **Run**.
7. النتيجة المتوقعة:
   - `Success. No rows returned`

## 6. إضافة أسرار Edge Function

داخل Supabase:

1. افتح **Edge Functions**.
2. افتح **Secrets** أو **Manage secrets**.
3. أضف:

### GOOGLE_CLIENT_ID

قيمة Google OAuth Client ID التي تنتهي غالبًا بـ:

`apps.googleusercontent.com`

### GOOGLE_CLIENT_SECRET

قيمة Google OAuth Client Secret.

### WATHIQ_APP_URL

اكتب:

`https://physicsbasit-debug.github.io/wathiq/`

المتغيران `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` متاحان تلقائيًا داخل Edge Functions ولا يُنسخان إلى GitHub.

## 7. نشر Edge Function من لوحة Supabase

1. افتح **Edge Functions**.
2. اضغط **Deploy a new function**.
3. اختر **Via Editor**.
4. اسم الدالة:
   - `google-drive-oauth`
5. استبدل كود المثال بمحتوى:
   - `supabase/functions/google-drive-oauth/index.ts`
6. عطّل **Verify JWT** أو **Enforce JWT verification** لهذه الدالة.

سبب التعطيل: رجوع Google إلى مسار `callback` لا يحمل Supabase JWT. الدالة نفسها تتحقق يدويًا من جلسة المالك في المسارات المحمية، وتتحقق من رمز `state` في callback.

7. اضغط **Deploy function**.

## 8. إضافة Client ID إلى GitHub

في مستودع `wathiq`:

1. افتح **Settings**.
2. اختر **Secrets and variables → Actions**.
3. افتح تبويب **Variables**.
4. اضغط **New repository variable**.
5. الاسم:
   - `WATHIQ_GOOGLE_OAUTH_CLIENT_ID`
6. القيمة:
   - Google OAuth Client ID
7. احفظ المتغير.

Client ID قيمة عامة مخصصة لتعريف التطبيق، أما Client Secret فيبقى داخل Supabase فقط.

## 9. إعادة نشر GitHub Pages

بعد دمج Pull Request إلى `main`:

1. افتح **Actions**.
2. اختر **نشر معاينة واثق**.
3. اضغط **Run workflow**.
4. اختر `main`.
5. اضغط الزر الأخضر **Run workflow**.

## 10. اختبار القبول

1. افتح منصة واثق.
2. سجّل دخول مالك المنصة.
3. افتح **إدارة المصادر**.
4. اضغط **ربط Google Drive**.
5. اختر حساب Google ووافق على الصلاحية.
6. يجب أن تعود إلى واثق وتظهر حالة:
   - `متصل وجاهز`
7. اضغط **فتح مجلد واثق**.
8. تحقق من وجود المجلدات الأساسية.
9. اضغط **التحقق من المجلدات** مرتين، وتأكد من عدم إنشاء نسخ مكررة.
10. جرّب **فصل الاتصال** وتأكد أن المجلدات لم تُحذف.

## ملاحظة فترة الاختبار في Google

إذا بقي تطبيق OAuth بحالة **Testing** وكان نوعه External، فقد تنتهي صلاحية Refresh Token بعد مدة قصيرة. هذا طبيعي في الاختبار. قبل الاستخدام التجاري يجب نقل إعداد OAuth إلى وضع الإنتاج واستكمال متطلبات Google المناسبة.
