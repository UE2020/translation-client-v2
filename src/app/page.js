"use client";
import { useRouter } from 'next/navigation'
import Progress from './progress.js';
import { invoke } from '@tauri-apps/api/tauri'
import { open } from '@tauri-apps/api/dialog';
import React, { useState, useEffect } from 'react';

const Options = {
    Install: 0,
    Load: 1,
    None: 2,
};

export default function Home() {
    const router = useRouter();
    const [loadingState, setLoadingState] = useState({
        loading: false,
        chosenOption: Options.None,
    });
    const [availableMemory, setAvailableMemory] = useState(0);

    useEffect(() => {
        const updateAvailableMemory = async () => {
            setAvailableMemory(await invoke('get_memory'));
        };

        updateAvailableMemory();
        const interval = setInterval(updateAvailableMemory, 1000);

        return () => clearInterval(interval);
    }, []);

    const iconClassName = "stroke-sky-500 w-6 h-6 " + (loadingState.loading ? "" : "group-hover:stroke-white");
    return (
        <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-[url(/grid.svg)]">
            <div className="p-5 flex-col box-border text-center justify-center flex">
                <h1 className="text-4xl font-bold p-3">First, install or open a <span className="before:block before:absolute before:-inset-1 before:-skew-y-3 before:bg-sky-500 relative inline-block ">
                    <span className="relative text-white">model file</span>
                </span></h1>
                <p className="mt-2">Already have the <strong>quantized</strong> <a target="_blank" href="https://huggingface.co/lmz/candle-mistral" className="text-sky-900 hover:underline">weights</a> installed? Load them here.</p>
                <p className="mt-2">Avoid loading the model unless you have at least 4 GB of memory available.</p>
                <p className="mt-2">You currently have <strong>{(Math.round(availableMemory / 1e+8) / 10).toFixed(1)} GB</strong> available.</p>
                <div className="flex flex-col sm:flex-row justify-center">
                    <div className="my-2 sm:my-4 mr-0 sm:mr-4">
                        <Button disabled={loadingState.loading} onClick={async () => {
                            setLoadingState({ loading: true, chosenOption: Options.Install });
                            let caught = false;
                            let path = await invoke('download_model').catch(e => {
                                alert("Failed to download model: " + e);
                                setLoadingState({ loading: false, chosenOption: Options.None });
                                caught = true;
                            });
                            if (caught) return;
                            let seconds = await invoke('load_model', { modelLocation: path }).catch(e => {
                                alert("Failed to load model: " + e);
                                setLoadingState({ loading: false, chosenOption: Options.None });
                                caught = true
                            });
                            if (caught) return;
                            router.push('/contribute');
                        }} description="Installs the model and loads it for you. If you previously used this option, use it again." icon={loadingState.chosenOption == Options.Install ? <svg className="animate-spin h-6 w-6 text-sky-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={iconClassName}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>}
                        >Download & install the model for me</Button>
                    </div>
                    <div className="my-2 sm:my-4 ml-0 sm:ml-4">
                        <Button disabled={loadingState.loading} onClick={async () => {
                            setLoadingState({ loading: true, chosenOption: Options.Load });
                            const selected = await open({
                                multiple: false,
                            });
                            if (!selected) {
                                setLoadingState({ loading: false, chosenOption: Options.None });
                                return;
                            }
                            let caught = false;
                            await invoke('load_model', { modelLocation: selected }).catch(e => {
                                alert("Failed to load model: " + e);
                                setLoadingState({ loading: false, chosenOption: Options.None });
                                caught = true;
                            });
                            if (caught) return;
                            router.push('/contribute.html');
                        }} description="Pick your own weights file. Only 4-bit quantized Mistral models are supported. Use if you know what you are doing." icon={loadingState.chosenOption == Options.Load ? <svg className="animate-spin h-6 w-6 text-sky-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={iconClassName}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
                        </svg>}
                        >Open model weights file</Button>
                    </div>
                </div>
                <Progress />
            </div>
        </div>
    );
}

function Button({ disabled, onClick, description, icon, children }) {
    return <a onClick={disabled ? null : onClick} type="button" href="#" className={"group block mx-auto rounded-lg p-4 bg-white ring-1 ring-slate-900/5 shadow-lg space-y-3 text-left justify-center w-full sm:max-w-xs " + (disabled ? "opacity-50" : "active:bg-sky-600 hover:ring-sky-500 hover:bg-sky-500")}>
        <div className="flex items-center space-x-3">
            {icon}
            <h3 className={"text-sm text-slate-900 font-semibold " + (disabled ? "" : "group-hover:text-white")}>{children}</h3>
        </div>
        <p className={"text-sm text-slate-500 " + (disabled ? "" : "group-hover:text-white")}>{description}</p>
    </a>;
}