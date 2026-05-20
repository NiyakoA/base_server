export interface BackendResponse<T> {
    success: boolean
    statusCode: number
    message: string
    data: T
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<BackendResponse<T>> {
    const isJson = init?.body !== undefined && !(init.body instanceof FormData)
    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        credentials: 'include',
        headers: {
            ...(isJson ? { 'Content-Type': 'application/json' } : {}),
            ...init?.headers
        }
    })

    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string }
        const error = new Error(err.message ?? res.statusText) as Error & { status: number }
        error.status = res.status
        throw error
    }

    return res.json() as Promise<BackendResponse<T>>
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<BackendResponse<T>> {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        credentials: 'include',
        body: formData
    })

    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string }
        const error = new Error(err.message ?? res.statusText) as Error & { status: number }
        error.status = res.status
        throw error
    }

    return res.json() as Promise<BackendResponse<T>>
}
