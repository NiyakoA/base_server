import LoginForm from '@/components/LoginForm'

export default function LoginPage() {
    return (
        <main className="flex min-h-screen items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <h1 className="text-2xl font-bold text-[#4cc9f0] mb-8">✦ OCR Extract</h1>
                <LoginForm />
            </div>
        </main>
    )
}
