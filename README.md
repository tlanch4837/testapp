# QuizForge – Save Missed Feature

This version of **QuizForge** adds a `Save Missed` button that downloads a CSV file containing all questions that were **answered incorrectly** or **never submitted**.

---

## Features

- Single-file HTML app – just open in a browser.
- Upload a CSV with **5 columns**:  
  `Question,Correct,Wrong1,Wrong2,Wrong3`
- Quiz randomizes **question order** and **answer order**.
- Shows correct/incorrect feedback after each question.
- Optional countdown timer (set in minutes).
- **NEW:** `Save Missed` button:
  - Creates a CSV with questions answered incorrectly or left unsubmitted.
  - Exports in the **same 5-column format** as the uploaded file.
  - Generates a filename like:  
    `quizforge_missed_2025-07-29_18-56-00.csv`

---

## Usage

1. Open `quizforge.html` in your browser.
2. Click **Choose File** and upload your CSV quiz file.
3. (Optional) Enter a time limit in minutes.
4. Click **Start** to begin.
5. At any time, click **Save Missed** to download the missed questions.

---

## Example CSV

```csv
What color is the sky?,Blue,Red,Green,Yellow
What is 2+2?,4,3,5,6
```

---

## Download

- Save the `quizforge.html` file locally.
- Double-click to open in your browser (Chrome, Edge, Firefox, etc).
- No server required.

