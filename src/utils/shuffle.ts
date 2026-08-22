import { ExamPackage, Question, QuestionOption } from "../types";

/**
 * Fisher-Yates array shuffle (non-mutating)
 */
export function shuffleArray<T>(items: T[]): T[] {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Prepares the student question list based on the exam's anti-cheating shuffle settings:
 * - Shuffle Question Order (shuffleQuestions)
 * - Shuffle Option Order (shuffleOptions) while maintaining correct answer mapping
 */
export function prepareStudentExamQuestions(exam: ExamPackage): Question[] {
  let questionsToUse = [...(exam.questions || [])];

  // 1. Shuffle Questions if enabled
  if (exam.shuffleQuestions && questionsToUse.length > 1) {
    questionsToUse = shuffleArray(questionsToUse);
  }

  // 2. Map and re-index questions, and optionally shuffle options
  const alphabetKeys = ["A", "B", "C", "D", "E", "F", "G"];

  return questionsToUse.map((q, qIdx) => {
    // If options shuffling is enabled and options exist
    if (exam.shuffleOptions && q.options && q.options.length > 1) {
      // Find the text of the original correct answer
      const originalCorrectOption = q.options.find(
        (opt) => opt.key.trim().toUpperCase() === q.correctAnswer.trim().toUpperCase()
      );
      const originalCorrectText = originalCorrectOption?.text;

      // Shuffle options
      const shuffledOptionsRaw = shuffleArray(q.options);

      // Re-assign keys sequentially (A, B, C, D, E...)
      const newOptions: QuestionOption[] = shuffledOptionsRaw.map((opt, optIdx) => ({
        key: alphabetKeys[optIdx] || String.fromCharCode(65 + optIdx),
        text: opt.text,
      }));

      // Determine new correct answer key matching the original correct option text
      let newCorrectKey = q.correctAnswer;
      if (originalCorrectText) {
        const foundNewOpt = newOptions.find((opt) => opt.text === originalCorrectText);
        if (foundNewOpt) {
          newCorrectKey = foundNewOpt.key;
        }
      }

      return {
        ...q,
        questionNumber: qIdx + 1,
        options: newOptions,
        correctAnswer: newCorrectKey,
      };
    }

    return {
      ...q,
      questionNumber: qIdx + 1,
      options: [...(q.options || [])],
    };
  });
}
