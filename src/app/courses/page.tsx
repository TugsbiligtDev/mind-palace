import { CourseCards } from "@/components/course/course-cards";

export const metadata = { title: "Courses" };

export default function CoursesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Courses</h1>
      <p className="mt-2 text-muted">Pick a skill. Each one has three levels: Beginner, Intermediate and Advanced.</p>
      <CourseCards />
    </div>
  );
}
