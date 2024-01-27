"use client";
import { invoke } from '@tauri-apps/api/tauri'
import React, { useState, useReducer, useRef, useEffect } from 'react';
import CopyButton from '../copy.js';
import { writeText, readText } from '@tauri-apps/api/clipboard';

export default function Home() {
    const [isGenerating, setGenerating] = useState(false);
    const [translatedText, setText] = useState('');
    const [inputText, setInputText] = useState('');
    return (
        <>
            <div className="flex h-full bg-sky-100">
                <textarea className="w-1/2 h-full p-10" placeholder="Enter text here..." onChange={e => setInputText(e.target.value)}></textarea>
                <p className="w-1/2 h-full p-10 overflow-auto">{translatedText} {translatedText != '' ? <CopyButton copyTarget={translatedText} /> : null}</p>
            </div>
            <button onClick={async () => {
                setGenerating(true);
                setText(await invoke("translate_sentence", { inputString: inputText }));
                setGenerating(false);
            }} className={"flex fixed top-full left-1/2 transform -translate-x-1/2 -translate-y-16 px-4 py-2 text-white bg-gradient-to-r from-blue-500 to-indigo-500 rounded font-black shadow-[0_0_2px_#fff,inset_0_0_2px_#fff,0_0_5px_#08f,0_0_15px_#08f,0_0_30px_#08f]" + (isGenerating ? " opacity-75" : "")} disabled={isGenerating}>
                { isGenerating ? <svg class="mr-3 h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg> : null } TRANSLATE
            </button>
        </>
    );
}