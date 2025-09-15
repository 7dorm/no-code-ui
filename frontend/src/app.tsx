// import { useState } from 'preact/hooks'
import {HomeScreen} from "./screens/HomeScreen.tsx";
import {
    Router,
} from 'preact-router';
import {BotInteracctionScreen} from "./screens/BotInteracctionScreen.tsx";
import {WorkspaceScreen} from "./screens/WorkspaceScreen.tsx";


export function App() {

    return (
        <Router>
            <HomeScreen path="/"/>
            <WorkspaceScreen path="/workspace/:id"/>
            <BotInteracctionScreen path="/bot/:id"/>
        </Router>
    )
}
