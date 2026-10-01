// Browser side of the HTML & CSS engine: grading renders each page in a hidden iframe on
// this page (see checkInFrame), so the learner's own browser does the measuring.
import { CHECK_RUNTIME, FRAME_HEIGHT, checkInFrame, gradeWeb, type WebCheck, type WebFiles, type WebVerdict } from "./core";

export function gradeWebPage(files: WebFiles, check: WebCheck): Promise<WebVerdict> {
  return gradeWeb((page, tests, width) => checkInFrame(page, tests, width, FRAME_HEIGHT, CHECK_RUNTIME), files, check);
}
