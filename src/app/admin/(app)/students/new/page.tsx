import StudentForm from '@/components/students/StudentForm'

export default function NewStudentPage() {
  return (
    <div>
      <div className="max-w-2xl mx-auto px-6 pt-6">
        <h1 className="text-2xl font-bold text-navy mb-6">Add New Student</h1>
      </div>
      <StudentForm />
    </div>
  )
}
