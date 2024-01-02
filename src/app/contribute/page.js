"use client";
import { invoke } from '@tauri-apps/api/tauri'
import React, { useState, useReducer, useRef, useEffect } from 'react';
import { writeText, readText } from '@tauri-apps/api/clipboard';

const Status = {
    None: 0,
    Connecting: 1,
    Contributing: 2,
    Stopping: 3,
};

function numberWithCommas(val) {
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default function Home() {
    const outerDiv = useRef(null);
    const [serverAddress, setAddress] = useState("");
    const [busy, setBusy] = useState(false);
    const [status, dispatch] = useReducer((status, action) => {
        const ret = { ...status };

        switch (action.type) {
            case "status_change":
                switch (status.status) {
                    case Status.None:
                        ret.ws = new WebSocket("ws://" + serverAddress);
                        ret.status = Status.Connecting;
                        ret.startTime = Date.now();
                        ret.translationsDone = 0;
                        ret.request = "";
                        ret.translation = "";
                        break;

                    case Status.Connecting:
                        ret.status = Status.Contributing;
                        break;

                    case Status.Contributing:
                        ret.status = Status.Stopping;
                        break;

                    case Status.Stopping:
                        ret.status = Status.None;
                        ret.ws.close();
                        ret.ws = null;
                        break;
                }
                break;

            case "status_reset":
                ret.status = Status.None;
                if (ret.ws) {
                    ret.ws.close();
                    ret.ws = null;
                }
                break;

            case "new_translation":
                if (action.translation != "") {
                    ret.request = action.request;
                    ret.translation = action.translation;
                }
                ++ret.translationsDone;
                break;
        }

        return ret;
    }, { status: Status.None, startTime: 0, ws: null, translationsDone: 0, request: "", translation: "" });

    if (status.ws) {
        status.ws.onopen = () => dispatch({ type: "status_change" });

        status.ws.onmessage = async msg => {
            if (status.status == Status.Stopping) {
                dispatch({ type: "status_change" });
                return;
            }

            setBusy(true);
            let translation = await invoke('create_translation_response', { inputString: msg.data }).catch(alert);
            setBusy(false);
            status.ws.send(translation[0]);
            dispatch({ type: "new_translation", request: msg.data, translation: translation[1] });

            if (status.status == Status.Stopping) {
                dispatch({ type: "status_change" });
            }
        };

        const errorHandler = () => {
            if (status.status == Status.Connecting || status.status == Status.Contributing) {
                alert("WebSocket connection failed");
                dispatch({ type: busy ? "status_change" : "status_reset" });
            }
        };
        status.ws.onerror = errorHandler;
        status.ws.onclose = errorHandler;
    }

    function getClass(status) {
        switch (status) {
            case Status.None: return "bg-sky-600 hover:bg-sky-700 focus:ring-4 focus:outline-none focus:ring-sky-300";
            case Status.Connecting: return "bg-sky-600 hover:bg-sky-700 focus:ring-4 focus:outline-none focus:ring-sky-300 opacity-50";
            case Status.Contributing: return "bg-red-600 hover:bg-red-700 focus:ring-4 focus:outline-none focus:ring-red-300";
            case Status.Stopping: return "bg-red-600 hover:bg-red-700 focus:ring-4 focus:outline-none focus:ring-red-300 opacity-50";
        }
    }

    function getButtonLabel(status) {
        switch (status) {
            case Status.None: return "Start";
            case Status.Connecting: return "Connecting...";
            case Status.Contributing: return "Stop";
            case Status.Stopping: return "Stopping...";
        }
    }

    return (
        <div className="w-full flex min-h-screen justify-center overflow-hidden bg-[url(/grid.svg)]">
            <div ref={outerDiv} className="p-5 flex-col box-border text-center justify-center flex sm:w-min">
                <h1 className="text-4xl font-bold p-3 sm:whitespace-nowrap">Press start to begin <span className="before:block before:absolute before:-inset-1 before:-skew-y-3 before:bg-sky-500 relative inline-block">
                    <span className="relative text-white">contributing</span>
                </span></h1>
                <p className="mt-2 text-lg">You may enter an alternative translation server address if needed.</p>
                <form className="flex justify-center my-5">
                    <input onChange={e => {
                        setAddress(e.target.value);
                    }} className="mx-2 bg-gray-50 ring-1 ring-slate-900/5 shadow-lg text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5" disabled={status.status == Status.Connecting || status.status == Status.Stopping}></input>
                    <button onClick={async e => {
                        e.preventDefault();
                        dispatch({ type: status.status == Status.Contributing && !busy ? "status_reset" : "status_change" });
                    }} type="submit" className={"ring-1 ring-slate-900/5 shadow-lg text-white font-medium rounded-lg text-sm px-5 py-1 text-center " + (getClass(status.status))} disabled={status.status == Status.Connecting || status.status == Status.Stopping}>{getButtonLabel(status.status)}</button>
                </form>

                {(status.status == Status.Contributing || status.status == Status.Stopping) && <div className="justify-center box-border inline-block">
                    <div className="relative text-left">
                        <div className="p-6 bg-white rounded-lg shadow-lg ring-1 ring-slate-900/5 box-border">
                            <h5 className="mb-2 text-xl font-bold tracking-tight text-gray-900">Contribution Statistics</h5>
                            <p className="text-sm font-normal text-gray-700"><strong>Translations done:</strong> {numberWithCommas(status.translationsDone)}</p>
                            <p className="text-sm font-normal text-gray-700"><strong>Translations per minute:</strong> {numberWithCommas((status.translationsDone / ((Date.now() - status.startTime) / 60000)).toFixed(3))}</p>
                            {status.translation != "" && <>
                                <p className="text-sm font-normal text-gray-700">
                                    <strong>Last request:</strong> <span className="font-serif">{status.request.toUpperCase()}</span> <CopyButton copyTarget={status.request} />
                                </p>
                                <p className="text-sm font-normal text-gray-700"><strong>Last translation:</strong> {status.translation} <CopyButton copyTarget={status.translation} /></p>
                            </>}
                        </div>
                        <span className="flex absolute h-3 w-3 top-0 right-0 -mt-1 -mr-1">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-600 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-600"></span>
                        </span>
                    </div>
                </div>}
            </div>
        </div>
    );
}

function CopyButton({ copyTarget }) {
    let [showCheck, setCheck] = useState(false);
    let clickHandler = async () => {
        await writeText(copyTarget);
        setCheck(true);
    };

    useEffect(() => {
        if (showCheck) {
            const timeout = setTimeout(() => setCheck(false), 2000);
            return () => clearTimeout(timeout);
        }
    }, [showCheck]);

    return <button onClick={clickHandler} className="bg-sky-500 ring-1 ring-slate-900/5 shadow-lg text-white font-medium rounded text-sm p-0.5 align-middle hover:bg-sky-700">{showCheck ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75" />
    </svg>
        : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
        </svg>}</button>;
}