import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";

interface QuestionMark {
  question_number: number;
  marks_obtained: number;
  max_marks: number;
}

interface MarksTableProps {
  studentName: string;
  rollNumber: string;
  questions: QuestionMark[];
  totalMarks: number;
  maxMarks: number;
}

export function MarksTable({ studentName, rollNumber, questions, totalMarks, maxMarks }: MarksTableProps) {
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-foreground">Student Name: {studentName || "N/A"}</p>
        <p className="text-sm text-muted-foreground">Roll No: {rollNumber || "N/A"}</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/2">Q. No</TableHead>
            <TableHead className="w-1/2">Marks</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((q) => (
            <TableRow key={q.question_number}>
              <TableCell className="font-medium">Q{q.question_number}</TableCell>
              <TableCell>{q.marks_obtained}/{q.max_marks}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-bold">Total</TableCell>
            <TableCell className="font-bold">{totalMarks}/{maxMarks}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
