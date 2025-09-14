// import { useState } from 'preact/hooks'
import {HomeScreen} from "./screens/HomeScreen.tsx";
import {
    Router,
} from 'preact-router';
import {SideBarUI} from "./components/UI/SideBarUI.tsx";
import {BotInteracctionScreen} from "./screens/BotInteracctionScreen.tsx";


export function App() {

    return (
        <Router>
            <HomeScreen path="/"/>
            <SideBarUI path="/help"/>
            <BotInteracctionScreen path="/bot/:id"/>
        </Router>
    )
}
