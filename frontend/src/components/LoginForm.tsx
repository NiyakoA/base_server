'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'

export default function LoginForm() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)

        try {
            await apiFetch('/v1/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            })
            router.push('/ocr')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
            <div>
                <label className="block text-xs text-[#4cc9f0] uppercase mb-1">Email</label>
                <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full bg-[#16213e] border border-[#0f3460] rounded px-3 py-2 text-sm text-[#e0e0e0] focus:outline-none focus:border-[#4cc9f0]"
                />
            </div>
            <div>
                <label className="block text-xs text-[#4cc9f0] uppercase mb-1">Password</label>
                <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full bg-[#16213e] border border-[#0f3460] rounded px-3 py-2 text-sm text-[#e0e0e0] focus:outline-none focus:border-[#4cc9f0]"
                />
            </div>
            {error && <p className="text-[#e94560] text-sm">{error}</p>}
            <button
                type="submit"
                disabled={loading}
                className="bg-[#0f3460] text-[#4cc9f0] rounded px-4 py-2 text-sm hover:bg-[#4cc9f0] hover:text-[#1a1a2e] transition-colors disabled:opacity-50"
            >
                {loading ? 'Signing in...' : 'Sign in'}
            </button>
        </form>
    )
}
