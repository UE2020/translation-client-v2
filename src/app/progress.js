'use client'
import React, { useState, useEffect } from 'react';
import { emit, listen } from '@tauri-apps/api/event'

export default function ProgressBar() {
    const [progress, setProgress] = useState({
        percentage: 0.0,
        downloaded: 0,
        downloadSize: 0,
    });
    useEffect(() => {
        const handleEvent = (event) => {
            let downloaded = event.payload[0];
            let downloadSize = event.payload[1];
            let completed = ((downloaded / downloadSize) * 100);
            setProgress({
                percentage: completed,
                downloaded,
                downloadSize,
            });
        };
        const unlisten = listen('download-progress', handleEvent);
        return async () => {
            unlisten.then(u => u());
        };
    }, []);
    const [isDownloading, setDownloadStatus] = useState(false);
    useEffect(() => {
        const handleEvent = (event) => {
            setDownloadStatus(true);
        };
        const unlisten = listen('starting-download', handleEvent);
        return async () => {
            unlisten.then(u => u());
        };
    })
    if (!isDownloading) {
        return null;
    }
    return (
        <div className="my-2 flex justify-center">
            <div className="w-5/6 bg-orange-300 rounded-full shadow-lg box-border w-full relative">
                <div className="bg-orange-500 text-xs font-medium text-black text-center p-0.5 leading-none rounded-full h-6 opacity-80 font-mono" style={{ width: `max(${progress.percentage}%, 1.5rem)`}}><p className="absolute m-0 top-2/4 -inset-x-0 -translate-y-1/2">{`${progress.percentage.toFixed(2)}% - ${(progress.downloaded/1e+6).toFixed(2)}/${(progress.downloadSize/1e+6).toFixed(2)} MB`}</p></div>
            </div>
        </div>
    )
}