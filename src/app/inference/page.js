"use client";
import { invoke } from '@tauri-apps/api/tauri'
import React, { useState, useEffect } from 'react';
import CopyButton from '../copy.js';
import { listen } from '@tauri-apps/api/event'

export default function Home() {
    const [isGenerating, setGenerating] = useState(false);
    const [translatedText, setText] = useState('');
    const [inputText, setInputText] = useState('');
    useEffect(() => {
        const handleEvent = (event) => {
            setText(translatedText + event.payload);
        };
        const unlisten = listen('translation-progress', handleEvent);
        return async () => {
            (await unlisten)();
        };
    }, [translatedText]);
    return (
        <>
            <div className="flex h-full bg-sky-100">
                <textarea className="w-1/2 h-full p-10 resize-none" placeholder="Enter text here..." onChange={e => setInputText(e.target.value)}></textarea>
                <p className="w-1/2 h-full p-10 overflow-auto">{translatedText} {translatedText != '' ? <CopyButton copyTarget={translatedText} /> : null}</p>
            </div>
            <button onClick={async () => {
                setGenerating(true);
                setText("");
                setText(await invoke("translate_sentence", { inputString: inputText }));
                setGenerating(false);
            }} className={"flex fixed top-full left-1/2 transform -translate-x-1/2 -translate-y-16 px-4 py-2 text-white bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 focus:ring-4 focus:ring-blue-300 rounded font-black shadow-lg" + (isGenerating ? " opacity-75" : " hover:bg-gradient-to-br")} disabled={isGenerating}>
                {isGenerating ? <svg className="mr-2 h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 mr-2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                </svg> } TRANSLATE
            </button>
        </>
    );
}
