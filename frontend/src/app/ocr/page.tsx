'use client'

import { useState } from 'react'
import { apiUpload } from '@/lib/api'
import ImageUploader from '@/components/ImageUploader'
import OcrResult from '@/components/OcrResult'

interface OcrData {
    text: string
    confidence: number
    pipeline: string
    processingTimeMs: number
}

const ERROR_MESSAGES: Record<number, string> = {
    413: 'File too large — max 10 MB',
    422: 'No image provided',
    500: 'Extraction failed — try a clearer image'
}

export default function OcrPage() {
    const [result, setResult] = useState<OcrData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    async function handleUpload(file: File) {
        setError(null)
        setResult(null)
        setLoading(true)

        try {
            const form = new FormData()
            form.append('image', file)
            const res = await apiUpload<OcrData>('/v1/ocr/extract', form)
            setResult(res.data)
        } catch (err) {
            const status = (err as Error & { status?: number }).status ?? 500
            setError(ERROR_MESSAGES[status] ?? ERROR_MESSAGES[500])
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="max-w-lg mx-auto px-4 py-8">
            <div className="bg-[#16213e] rounded-lg px-4 py-3 mb-6">
                <span className="text-[#4cc9f0] font-bold">✦ OCR Extract</span>
            </div>

            <div className="flex flex-col gap-4">
                <ImageUploader onUpload={handleUpload} disabled={loading} />
                {loading && <p className="text-center text-sm text-[#aaa]">Extracting...</p>}
                {error && <p className="text-center text-sm text-[#e94560]">{error}</p>}
                {result && <OcrResult {...result} />}
            </div>
        </div>
    )
}
