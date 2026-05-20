'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { checkSession } from '@/lib/auth'

export default function Home() {
    const router = useRouter()

    useEffect(() => {
        checkSession().then(ok => {
            router.replace(ok ? '/ocr' : '/login')
        })
    }, [router])

    return null
}
