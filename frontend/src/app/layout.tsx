import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
    title: 'OCR Extract',
    description: 'Handwritten text extraction'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="bg-[#1a1a2e] text-[#e0e0e0] min-h-screen font-mono">{children}</body>
        </html>
    )
}
