<div dir="rtl">

# Captions for Premiere Pro

תוסף חינמי לפרמייר פרו שמייצר כתוביות אוטומטיות בעברית ובאנגלית — ומכניס אותן לטיימליין כ-**Caption Track אמיתי** שאפשר לערוך ולעצב.

- 🎙️ **תמלול על המחשב שלך** — בחינם, בלי להעלות את הסרטון לשום מקום (Whisper + מודל העברית של ivrit.ai)
- ✂️ **עורך כתוביות** — הזזת מילים בין כתוביות, פיצול, מיזוג ותיקון טקסט
- ✨ **שיפור עם AI (לא חובה)** — Gemini מתקן מילים שתומללו לא נכון ומחלק את הכתוביות לפי משמעות
- 🎬 **כתוביות חיות בפרמייר** — מעצבים עם ה-Track Style שלכם, ומקבלים גם קובץ SRT

[English below ↓](#english)

---

## דרישות

| | |
|---|---|
| **פרמייר פרו** | גרסה 2025 ומעלה |
| **מחשב** | מק עם מעבד Apple (M1/M2/M3/M4…) **או** Windows 10/11 |
| **מקום פנוי** | כ-2GB לכל שפה (המודל יורד בפעם הראשונה) |

> מק עם מעבד Intel עדיין לא נתמך.

---

## התקנה

### שלב 1: הורידו את התוסף
היכנסו ל-[**דף ההורדות**](https://github.com/IamGuyTal/Premiere-Captions-extension-english-hebrew/releases/latest) והורידו את הקובץ **`Captions-1.0.1.zxp`** (תחת Assets).

### שלב 2: התקינו אותו

**הדרך הקלה — ZXP Installer (חינמי):**
1. הורידו והתקינו את [ZXP Installer](https://aescripts.com/learn/zxp-installer/) (מק או Windows).
2. **סגרו את פרמייר.**
3. פתחו את ZXP Installer וגררו לתוכו את הקובץ `Captions-1.0.1.zxp`.
4. חכו להודעה שההתקנה הצליחה.

<details>
<summary><b>דרך חלופית — בלי תוכנה נוספת (שורת פקודה)</b></summary>

לכל מי שמותקן אצלו Creative Cloud יש כבר את מתקין התוספים של אדובי. סגרו את פרמייר, ואז:

**במק** — פתחו את Terminal, הקלידו את הפקודה, רווח, וגררו את קובץ ה-zxp לחלון (זה מוסיף את הנתיב). לחצו Enter:
```
"/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent" --install
```

**ב-Windows** — פתחו את Command Prompt, הקלידו את הפקודה, רווח, וגררו את קובץ ה-zxp לחלון. לחצו Enter:
```
"C:\Program Files\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe" /install
```
</details>

### שלב 3: פתחו בפרמייר
פתחו את פרמייר ובחרו בתפריט **Window ← Extensions ← Captions**.

### שלב 4: הורידו את מודל התמלול (פעם אחת)
בראש הפאנל יופיע **"צריך להוריד את המודל"** — לחצו **הורד**. זה כ-1.6GB ולוקח כמה דקות. המודל לעברית ומודל לאנגלית יורדים בנפרד, לפי השפה שבוחרים.

---

## איך משתמשים

1. בחרו **שפה**, **מקור** (כל הסיקוונס, או רק בין In ל-Out שסימנתם), וכמה **מילים בכתובית**.
2. לחצו **תמלל**.
3. ערכו בפאנל:
   - **לחיצה על מילה** — בוחרת אותה ופותחת כלים: העברה לכתובית הקודמת/הבאה, פיצול, עריכה ומחיקה
   - **לחיצה כפולה** — עריכת המילה
   - **לחיצה על הזמן** — קפיצה לנקודה הזו בטיימליין
   - **בטל ↶** או ⌘Z / Ctrl+Z — ביטול
4. (לא חובה) לחצו **שפר עם AI** — מילים שתוקנו יסומנו בצהוב.
5. לחצו **הכנס לפרמייר כ-Caption Track**.
6. לעיצוב: בחרו את כל הכתוביות בטראק, ובחלון Properties / Essential Graphics בחרו את ה-**Track Style** שלכם.

---

## שיפור עם AI — הגדרת מפתח Gemini חינמי (לא חובה)

1. בפאנל, לחצו **"קבל מפתח"** ליד "מפתח Gemini" (או היכנסו ל-[aistudio.google.com/apikey](https://aistudio.google.com/apikey)).
2. התחברו עם חשבון גוגל ולחצו **Create API key**.
3. העתיקו את המפתח (מתחיל ב-`AIza`) והדביקו בשדה בפאנל.

> 🔒 המפתח נשמר רק אצלכם. בתוכנית החינמית Google עשויה להשתמש בטקסט שנשלח לשיפור המודלים שלה — נשלח **רק הטקסט** של הכתוביות, ורק כשלוחצים על הכפתור. לפעמים Gemini עמוס — אם מופיעה הודעה שלקח לו יותר מדי זמן, פשוט לחצו שוב.

---

## בעיות נפוצות

**לא רואה את Captions בתפריט Extensions**
סגרו את פרמייר לגמרי (⌘Q / Alt+F4) ופתחו מחדש. אם עדיין לא — התקינו שוב את קובץ ה-zxp.

**במק: הודעה ש-"whisper-cli" לא יכול להיפתח**
פתחו **System Settings ← Privacy & Security**, גללו למטה ולחצו **Open Anyway** ליד whisper-cli. נסו לתמלל שוב.

**ב-Windows: התמלול איטי**
ב-Windows התמלול רץ על המעבד (בלי כרטיס גרפי), אז לוקח יותר זמן — בערך פי 1–3 מאורך הסרטון, תלוי במחשב. כדאי לתמלל קטעים עם In/Out.

**ב-Windows: האנטי-וירוס חוסם**
התוסף מריץ את Whisper (`whisper-cli.exe`) מתוך תיקיית התוסף. אם האנטי-וירוס חוסם אותו, אשרו אותו.

**הכתוביות לא מסונכרנות**
ודאו שבחרתם את השפה הנכונה לפני התמלול. מודל העברית מיועד לעברית בלבד.

---

## הסרה

- **התוסף:** ב-ZXP Installer בחרו את Captions ← Remove. או מחקו את התיקייה `Captions` מתוך:
  - מק: `/Library/Application Support/Adobe/CEP/extensions/`
  - Windows: `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\`
- **המודלים (כ-3GB):** מחקו את התיקייה:
  - מק: `~/Library/Application Support/PremiereCaptions`
  - Windows: `%APPDATA%\PremiereCaptions`

---

## פרטיות
- האודיו מתומלל **על המחשב שלכם** ולא נשלח לשום מקום.
- אם לוחצים "שפר עם AI", **רק הטקסט** של הכתוביות נשלח ל-Google Gemini.

## קרדיטים
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) — MIT
- [OpenAI Whisper](https://github.com/openai/whisper) large-v3-turbo — MIT
- מודל העברית של [ivrit.ai](https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml) — Apache 2.0

</div>

---

<a name="english"></a>
# Captions for Premiere Pro (English)

A free Premiere Pro extension that auto-generates Hebrew and English captions and adds them to your timeline as a **real, editable Caption Track**.

- Local transcription with Whisper (ivrit.ai model for Hebrew) — free and private
- Caption editor: move words between captions, split, merge, fix text, undo
- Optional AI pass with a free Gemini API key: fixes misheard words and phrases captions naturally
- Live captions in Premiere — style them with your Track Style; an SRT file is saved next to your project

## Requirements
- Premiere Pro 2025 or newer
- Mac with Apple Silicon, or Windows 10/11 (Intel Macs are not supported yet)
- About 2 GB free per language (the model downloads on first use)

## Install
1. Download **`Captions-1.0.1.zxp`** from the [latest release](https://github.com/IamGuyTal/Premiere-Captions-extension-english-hebrew/releases/latest).
2. Quit Premiere. Install with the free [ZXP Installer](https://aescripts.com/learn/zxp-installer/) (drag the file in), or with Adobe's built-in installer:
   - **Mac:** `"/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent" --install <path-to-zxp>`
   - **Windows:** `"C:\Program Files\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe" /install <path-to-zxp>`
3. Open Premiere → **Window → Extensions → Captions**.
4. Click **Download** next to the model status (about 1.6 GB, once per language).

## Use
Choose language, source (whole sequence or In→Out) and words per caption → **Transcribe** → edit → optionally **Improve with AI** → **Insert into Premiere as Caption Track**.

## Troubleshooting
- **Panel missing:** fully quit and reopen Premiere; reinstall the zxp if needed.
- **Mac blocks `whisper-cli`:** System Settings → Privacy & Security → Open Anyway.
- **Slow on Windows:** Windows runs on the CPU; transcribe In→Out ranges for long videos.

## Privacy
Audio is transcribed locally and never uploaded. Only caption text is sent to Google Gemini, and only when you click "Improve with AI".

## Credits
[whisper.cpp](https://github.com/ggml-org/whisper.cpp) (MIT) · OpenAI Whisper large-v3-turbo (MIT) · [ivrit.ai](https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml) Hebrew model (Apache 2.0)
