# النشر الآلي عبر GitHub API (مجاني)

أي أداة (Make، n8n، Zapier، سكربت، تطبيق هاتف) تستطيع نشر قصة أو فيديو **بطلب واحد**:
تضع ملف JSON في المجلد `content/inbox/`، فيبني GitHub الموقع وينشره تلقائيًا خلال دقيقتين.
يعمل معه **النشر المجدول** (`publish_date`) و**المسودة** (`draft`) كما في لوحة التحكم.

---

## 1) المفتاح (Token) — مرة واحدة

1. GitHub ← صورتك ← **Settings ← Developer settings ← Personal access tokens ← Fine-grained tokens ← Generate new token**.
2. **Expiration**: مدة محددة (مثلًا 90 يومًا أو سنة).
3. **Repository access** ← **Only select repositories** ← `arabic-orbit` فقط.
4. **Permissions ← Repository permissions ← Contents** ← **Read and write**.
5. **Generate token** وانسخه واحفظه في مكان آمن (لا يظهر مرة أخرى).

> لا تضع المفتاح في الموقع ولا ترسله لأحد. إن تسرّب: احذفه من الصفحة نفسها وأنشئ غيره.

---

## 2) شكل الملف

### قصة
```json
{
  "type": "story",
  "title_ar": "جُحَا وَالحِمَار",
  "glyph": "حمار",
  "image": "/img/juha7.webp",
  "text_ar": "الجملة الأولى.\nالجملة الثانية.",
  "translations": {
    "en": { "title": "Juha and the Donkey", "text": "…", "moral": "…" },
    "fr": { "title": "Juha et l'âne", "text": "…", "moral": "…" }
  },
  "publish_date": "2026-12-01",
  "draft": false
}
```
- `image`: إما `/img/اسم.webp` (صورة مرفوعة إلى `public/img/`) أو رابط كامل `https://…`.
- الترجمات الناقصة تأخذ الإنجليزية مكانها.

### فيديو
```json
{
  "type": "video",
  "lang": "fr",
  "label": "Leçon 5",
  "title": "Les lettres ب ت ث",
  "description": "Prononciation et écriture",
  "url": "https://www.youtube.com/watch?v=XXXXXXXXXXX",
  "glyph": "ب ت ث",
  "publish_date": "2026-12-01"
}
```
- `lang`: en, fr, es, pt, it, de, nl, tr, ru, id, zh.

---

## 3) الطلب

```
PUT https://api.github.com/repos/AdilYassine100/arabic-orbit/contents/content/inbox/<اسم-فريد>.json
Authorization: Bearer <TOKEN>
Accept: application/vnd.github+json

{ "message": "API: قصة جديدة", "content": "<محتوى الملف بترميز base64>" }
```

### مثال curl (Mac / Linux)
```bash
TOKEN="ضع_المفتاح_هنا"
NAME="2026-12-01-juha-donkey.json"
CONTENT=$(base64 < story.json | tr -d '\n')
curl -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/AdilYassine100/arabic-orbit/contents/content/inbox/$NAME \
  -d "{\"message\":\"API: $NAME\",\"content\":\"$CONTENT\"}"
```

### رفع صورة القصة
الطلب نفسه، لكن المسار `public/img/juha7.webp` والمحتوى هو الصورة بـ base64.
ثم في القصة: `"image": "/img/juha7.webp"`.

### في Make أو n8n
- وحدة **HTTP ← Make a request**، الطريقة **PUT**، الرابط أعلاه.
- الترويسات: `Authorization: Bearer …` و `Accept: application/vnd.github+json`.
- الجسم JSON: `message` و `content` = `base64(النص)` (في Make: `{{base64(…)}}`، في n8n: `{{ $json.text.toBase64() }}` أو عقدة Move Binary Data).

---

## ملاحظات
- **اسم الملف يجب أن يكون جديدًا** في كل مرة (ضع التاريخ أو رقمًا). نفس الاسم يرفض الطلب إلا مع `sha` الملف القديم (للتعديل).
- **للحذف**: احذف الملف من `content/inbox/` على GitHub.
- القصص والفيديوهات من صندوق الوارد تظهر **بعد** المحتوى المضاف من لوحة التحكم.
- إن كان في الملف خطأ JSON تفشل عملية البناء في تبويب **Actions** ويبقى الموقع القديم منشورًا.
- مجاني بالكامل: حد GitHub هو 5000 طلب في الساعة.
