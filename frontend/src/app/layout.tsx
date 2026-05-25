import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
    title: 'Homework Grader',
    description: 'Handwritten exam grading'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="bg-[#1a1a2e] text-[#e0e0e0] min-h-screen font-mono">
                <nav className="border-b border-[#2a2a4a] px-6 py-3 flex items-center gap-6">
                    <span className="text-[#4cc9f0] font-bold">✦ Homework Grader</span>
                    <Link href="/exam" className="text-sm text-[#e0e0e0] hover:text-[#4cc9f0] transition-colors">
                        Grade
                    </Link>
                    <Link href="/results" className="text-sm text-[#e0e0e0] hover:text-[#4cc9f0] transition-colors">
                        Results
                    </Link>
                </nav>
                {children}
            </body>
        </html>
    )
}
