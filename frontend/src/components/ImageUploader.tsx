'use client'

import { useRef, useState, DragEvent } from 'react'

interface Props {
    onUpload: (file: File) => void
    disabled?: boolean
}

export default function ImageUploader({ onUpload, disabled }: Props) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [dragging, setDragging] = useState(false)

    function handleFiles(files: FileList | null) {
        if (!files || files.length === 0) return
        onUpload(files[0])
    }

    function onDrop(e: DragEvent) {
        e.preventDefault()
        setDragging(false)
        handleFiles(e.dataTransfer.files)
    }

    return (
        <div
            onClick={() => !disabled && inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={[
                'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                dragging ? 'border-[#4cc9f0] bg-[#0f3460]/20' : 'border-[#4cc9f0]/40 hover:border-[#4cc9f0]',
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            ].join(' ')}
        >
            <div className="text-3xl mb-2">📄</div>
            <p className="text-sm text-[#aaa]">Drop image here or click to upload</p>
            <p className="text-xs text-[#555] mt-1">PNG, JPG, WEBP, TIFF · max 10 MB</p>
            <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/tiff"
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
                disabled={disabled}
            />
        </div>
    )
}
