'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)
        try {
            await apiFetch('/v1/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            })
            router.push('/exam')
        } catch (err) {
            const e = err as Error & { status?: number }
            if (e.status === 401 || e.status === 403) {
                setError('Invalid email or password')
            } else {
                setError(e.message ?? 'Login failed')
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex items-center justify-center min-h-[80vh]">
            <form
                onSubmit={handleLogin}
                className="bg-[#16213e] rounded-lg p-8 w-full max-w-sm flex flex-col gap-4"
            >
                <h1 className="text-[#4cc9f0] font-bold text-lg">Sign in</h1>

                <label className="flex flex-col gap-1 text-sm">
                    <span className="text-[#aaa]">Email</span>
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="bg-[#0f0e17] border border-[#2a2a4a] rounded px-3 py-2 text-[#e0e0e0] focus:outline-none focus:border-[#4cc9f0]"
                    />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                    <span className="text-[#aaa]">Password</span>
                    <input
                        type="password"
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="bg-[#0f0e17] border border-[#2a2a4a] rounded px-3 py-2 text-[#e0e0e0] focus:outline-none focus:border-[#4cc9f0]"
                    />
                </label>

                {error && <p className="text-sm text-[#e94560]">{error}</p>}

                <button
                    type="submit"
                    disabled={loading}
                    className="bg-[#4cc9f0] text-[#0f0e17] font-semibold py-2 rounded transition-opacity disabled:opacity-40"
                >
                    {loading ? 'Signing in…' : 'Sign in'}
                </button>
            </form>
        </div>
    )
}
