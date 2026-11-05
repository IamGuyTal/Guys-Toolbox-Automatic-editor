<div dir="rtl">

# Guy Tal - Toolbox לפרמייר פרו

ארגז כלים חינמי לפרמייר פרו, בעברית ובאנגלית. ארבעה כלים בפאנל אחד:

- 🎙️ **כתוביות:** תמלול אוטומטי על המחשב שלכם, עורך כתוביות, והכנסה לטיימליין כ-**Caption Track אמיתי** שאפשר לעצב.
- ✂️ **הסרת שקטים:** מוצא את הקטעים השקטים בסרטון גלם וחותך אותם, בלי לחתוך אף מילה.
- ◫ **פודקאסט:** מחליף מצלמה אוטומטית לפי מי שמדבר (2–4 דוברים, עם שוט רחב).
- ▶ **רילז:** עובר על פרק שלם, מוצא את הקטעים הכי חזקים ובונה מכל אחד סיקוונס אנכי 9:16.

התמלול רץ על המחשב שלכם ולא מעלה את הסרטון לשום מקום. כלי הרילז ושיפור הכתוביות משתמשים ב-AI לבחירתכם: **Gemini** (חינם) או **Claude** (בתשלום, לפי שימוש).

[English below ↓](#english)

---

## דרישות

| | |
|---|---|
| **פרמייר פרו** | גרסה 2025 ומעלה |
| **מחשב** | מק עם מעבד Apple (M1/M2/M3/M4…) **או** Windows 10/11 |
| **מקום פנוי** | בערך 2GB לכל שפה (מודל התמלול יורד בפעם הראשונה) |

מק עם מעבד Intel עדיין לא נתמך.

ב-Windows כלי הכתוביות נבדק. שאר הכלים עדיין לא נבדקו שם. אם נתקלתם בבעיה, דווחו עליה ב-[Issues](https://github.com/IamGuyTal/Premiere-Captions-extension-english-hebrew/issues).

---

## התקנה

### שלב 1: הורידו את התוסף
היכנסו ל-[**דף ההורדות**](https://github.com/IamGuyTal/Premiere-Captions-extension-english-hebrew/releases/latest) והורידו את הקובץ **`Guy-Tal-Toolbox-1.1.0.zxp`** (תחת Assets). שם יש גם מדריך התקנה שנפתח בדפדפן: `install-guide.html`.

### שלב 2: התקינו אותו

**הדרך הקלה: ZXP Installer (חינמי)**
1. הורידו והתקינו את [ZXP Installer](https://aescripts.com/learn/zxp-installer/) (יש גרסה למק ול-Windows).
2. **סגרו את פרמייר.**
3. פתחו את ZXP Installer וגררו לתוכו את קובץ ה-zxp.
4. חכו להודעה שההתקנה הצליחה.

מי שהתקין גרסה קודמת (Captions) מקבל את ארגז הכלים כעדכון. המודלים שכבר הורדו נשארים.

<details>
<summary><b>דרך חלופית בלי תוכנה נוספת (שורת פקודה)</b></summary>

מי שמותקן אצלו Creative Cloud כבר יש לו את מתקין התוספים של אדובי. סגרו את פרמייר, ואז:

**במק:** פתחו את Terminal, הדביקו את הפקודה, הוסיפו רווח וגררו את קובץ ה-zxp לחלון. לחצו Enter.
```
"/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent" --install
```

**ב-Windows:** פתחו את Command Prompt, הדביקו את הפקודה, הוסיפו רווח וגררו את קובץ ה-zxp לחלון. לחצו Enter.
```
"C:\Program Files\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe" /install
```
</details>

### שלב 3: פתחו בפרמייר
בתפריט: **Window ← Extensions ← Guy Tal - Toolbox**. מסך הבית מציג את ארבעת הכלים.

### שלב 4: הורידו את מודל התמלול (פעם אחת)
בכלי הכתוביות, בראש הפאנל תופיע ההודעה "צריך להוריד את המודל". לחצו **הורד**. המודל שוקל בערך 1.6GB. לעברית ולאנגלית יש מודלים נפרדים.

---

## הכלים

### 🎙️ כתוביות
1. בחרו שפה, מקור (כל הסיקוונס או In → Out) וכמה מילים בכתובית, ולחצו **תמלל**.
2. ערכו בפאנל: לחיצה על מילה פותחת כלים (העברה לכתובית הקודמת או הבאה, פיצול, עריכה, מחיקה), לחיצה כפולה עורכת, לחיצה על הזמן קופצת לטיימליין, ו-⌘Z / Ctrl+Z מבטל.
3. (לא חובה) **שפר עם AI** מתקן מילים שתומללו לא נכון. מילים שתוקנו מסומנות בצהוב.
4. **הכנס לפרמייר כ-Caption Track**. לעיצוב, בחרו את כל הכתוביות ובחרו את ה-Track Style שלכם.

### ✂️ הסרת שקטים
לסרטון גלם אחד עם סאונד מסונכרן.
1. בחרו מקור והגדרות: סף שקט (אוטומטי או ידני), שקט מינימלי, ו"אוויר" לפני ואחרי דיבור.
2. **הגנה על מילים עם Whisper** מוודאת שאף מילה לא נחתכת, גם מילה שנאמרה בשקט.
3. **נתח שקטים**, עברו על הרשימה (לחיצה על זמן קופצת לטיימליין), ו**חתוך בפרמייר**.
4. החיתוך נעשה ב**עותק** בשם "(silence cut)". המקור לא משתנה, ו**בטל שינויים** מוחק את העותק.

### ◫ פודקאסט
לפרק מסונכרן שבו לכל דובר יש מצלמה ומיקרופון משלו.
1. שייכו לכל דובר טראק מיקרופון וטראק מצלמה (2–4 דוברים), ואם יש, טראק לשוט רחב.
2. הגדרות: אורך שוט מינימלי, התעלמות מתגובות קצרות, שוט רחב כשמדברים יחד, ושוט רחב לגיוון.
3. **נתח מי מדבר** מציג פס צבעוני של כל הפרק. **ערוך בפרמייר** יוצר עותק "(podcast edit)".
4. השוטים שלא בשימוש **מכובים, לא נמחקים**, אז אפשר להחליף מצלמה ידנית בהדלקה של שוט אחר.

### ▶ רילז
1. בחרו מקור ושפה. אם הגדרתם את כלי הפודקאסט, אפשר לזהות דוברים ולבחור **פוקוס**: המרואיין, או כולם.
2. **מצא רילז:** הפרק מתומלל, וה-AI מחפש סיפורים שעומדים בפני עצמם: Hook שעוצר גלילה, מבנה של פתיחה, אמצע ושיא, והכי קצר שאפשר בלי לאבד את המסר.
3. עברו על הרשימה: ציון, כותרת, ה-Hook, למה זה עובד, וכל הקטעים לפי סדר הניגון. אפשר להסיר קטע או ריל שלם.
4. **צור סיקוונסים לרילז שנבחרו**. כל ריל נבנה כסיקוונס בתיקייה **Reels**, אנכי 9:16 כשהמקור רחב, עם המצלמה הנכונה ועם כל המיקרופונים. החיתוכים נופלים בין מילים.

---

## AI: ‏Gemini או Claude

את ספק ה-AI בוחרים בכרטיס **AI**, שמופיע בכלי הכתוביות ובכלי הרילז.

| | Gemini | Claude |
|---|---|---|
| מחיר | חינם (עם מגבלת שימוש) | בתשלום לפי שימוש |
| שיפור כתוביות לסרטון של 3 דקות | חינם | בערך 3–6 סנט |
| רילז מפרק של שעה | חינם | בערך 40 סנט |
| מפתח | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | [platform.claude.com](https://platform.claude.com/) |

בבדיקה שלנו, Claude ערך רילז טובים יותר: חיתוכים פנימיים, פתיחה חזקה ויותר רילז. Gemini בחר בעיקר קטעים רציפים. אחרי כל שימוש ב-Claude הפאנל מציג את העלות המדויקת.

המפתחות נשמרים רק אצלכם. נשלח רק **הטקסט**, אף פעם לא האודיו או הווידאו, ורק כשלוחצים על הכפתור. בתוכנית החינמית Google עשויה להשתמש בטקסט כדי לשפר את המודלים שלה. אם Gemini עמוס ומופיעה הודעה שלקח לו יותר מדי זמן, לחצו שוב.

---

## בעיות נפוצות

**לא רואים את התוסף בתפריט Extensions**
סגרו את פרמייר לגמרי (⌘Q במק, Alt+F4 ב-Windows) ופתחו מחדש. אם עדיין לא מופיע, התקינו שוב את קובץ ה-zxp.

**במק: הודעה ש-whisper-cli לא יכול להיפתח**
פתחו **System Settings ← Privacy & Security**, גללו למטה ולחצו **Open Anyway** ליד whisper-cli.

**ב-Windows: התמלול איטי**
ב-Windows התמלול רץ על המעבד ולא על הכרטיס הגרפי. בפרקים ארוכים כדאי לעבוד על קטעים עם In/Out.

**ב-Windows: האנטי-וירוס חוסם**
התוסף מריץ את Whisper (`whisper-cli.exe`) מתוך תיקיית התוסף. אם האנטי-וירוס חוסם אותו, אשרו אותו.

**יש טראקים נעולים**
הסרת שקטים ופודקאסט לא עובדים על טראקים נעולים. פתחו את הנעילה ונסו שוב.

---

## הסרה

- **התוסף:** ב-ZXP Installer בחרו את Guy Tal - Toolbox ולחצו Remove.
- **המודלים (בערך 3GB):** מחקו את התיקייה:
  - מק: `~/Library/Application Support/PremiereCaptions`
  - Windows: `%APPDATA%\PremiereCaptions`

---

## קרדיטים
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (MIT)
- [OpenAI Whisper](https://github.com/openai/whisper) large-v3-turbo (MIT)
- מודל העברית של [ivrit.ai](https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml) (Apache 2.0)

</div>

---

<a name="english"></a>
# Guy Tal - Toolbox for Premiere Pro (English)

A free Premiere Pro toolbox for Hebrew and English, with four tools in one panel:

- **Captions:** local transcription, a caption editor, and a real, editable Caption Track.
- **Silence removal:** finds and cuts the silent parts of raw footage without cutting a single word.
- **Podcast:** switches cameras automatically to whoever is speaking (2–4 speakers, optional wide shot).
- **Reels:** reads a full episode, finds the strongest stand-alone stories and builds each one as a vertical 9:16 sequence.

Transcription runs on your computer; nothing is uploaded. Reels and caption improvement use the AI of your choice: Gemini (free) or Claude (paid per use).

## Requirements
- Premiere Pro 2025 or newer
- Mac with Apple Silicon, or Windows 10/11 (Intel Macs are not supported yet)
- On Windows, the Captions tool has been tested. The other tools have not been tested there yet. If you run into a problem, please report it in [Issues](https://github.com/IamGuyTal/Premiere-Captions-extension-english-hebrew/issues).
- About 2 GB free per language (the model downloads on first use)

## Install
1. Download **`Guy-Tal-Toolbox-1.1.0.zxp`** from the [latest release](https://github.com/IamGuyTal/Premiere-Captions-extension-english-hebrew/releases/latest).
2. Quit Premiere and install it with the free [ZXP Installer](https://aescripts.com/learn/zxp-installer/) (drag the file in), or with Adobe's built-in installer:
   - **Mac:** `"/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent" --install <path-to-zxp>`
   - **Windows:** `"C:\Program Files\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe" /install <path-to-zxp>`
3. Open Premiere → **Window → Extensions → Guy Tal - Toolbox**.
4. In Captions, click **Download** next to the model status (about 1.6 GB, once per language).

## The tools
- **Captions:** transcribe → edit → optionally Improve with AI → Insert into Premiere as Caption Track.
- **Silence removal:** analyse → review the list → cut. Cuts happen in a copy ("(silence cut)"); Undo deletes it.
- **Podcast:** map each speaker to a mic track and a camera track → analyse → edit. Works on a copy ("(podcast edit)"); unused shots are disabled, not deleted.
- **Reels:** find reels → review titles, hooks and pieces → create sequences in a "Reels" bin (vertical when the source is landscape).

## AI
Pick Gemini (free) or Claude (paid per use) in the AI card. Rough Claude costs: about $0.03–0.06 to improve captions for a 3-minute video, about $0.40 for reels from a one-hour episode. Only text is sent, never audio or video, and only when you click the button.

## Troubleshooting
- **Panel missing:** fully quit and reopen Premiere; reinstall the zxp if needed.
- **Mac blocks `whisper-cli`:** System Settings → Privacy & Security → Open Anyway.
- **Slow on Windows:** Windows runs on the CPU; work on In→Out ranges for long episodes.
- **Locked tracks:** unlock them before silence removal or podcast edits.

## Credits
[whisper.cpp](https://github.com/ggml-org/whisper.cpp) (MIT) · OpenAI Whisper large-v3-turbo (MIT) · [ivrit.ai](https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml) Hebrew model (Apache 2.0)
