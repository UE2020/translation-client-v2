"use client";
import { invoke } from '@tauri-apps/api/tauri'
import React, { useState, useReducer, useRef } from 'react';

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
                    }} type="submit" className={"ring-1 ring-slate-900/5 shadow-lg text-white font-medium rounded-lg text-sm px-5 py-1 text-center " + (getClass(status.status))}>{getButtonLabel(status.status)}</button>
                </form>

                {(status.status == Status.Contributing || status.status == Status.Stopping) && <div className="justify-center box-border inline-block">
                    <div className="relative text-left">
                        <div className="p-6 bg-white rounded-lg shadow-lg ring-1 ring-slate-900/5 box-border">
                            <h5 className="mb-2 text-xl font-bold tracking-tight text-gray-900">Contribution Statistics</h5>
                            <p className="text-sm font-normal text-gray-700"><strong>Translations done:</strong> {numberWithCommas(status.translationsDone)}</p>
                            <p className="text-sm font-normal text-gray-700"><strong>Translations per minute:</strong> {numberWithCommas((status.translationsDone / ((Date.now() - status.startTime) / 60000)).toFixed(3))}</p>
                            {status.translation != "" && <>
                                <p className="text-sm font-normal text-gray-700"><strong>Last request:</strong> <span className="font-serif">{status.request.toUpperCase()}</span></p>
                                <p className="text-sm font-normal text-gray-700"><strong>Last translation:</strong> {status.translation}</p>
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