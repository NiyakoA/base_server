import { apiFetch } from './api'

export async function checkSession(): Promise<boolean> {
    try {
        await apiFetch('/v1/user/me')
        return true
    } catch {
        return false
    }
}

export async function logout(): Promise<void> {
    await apiFetch('/v1/logout', { method: 'PUT' }).catch(() => undefined)
}
