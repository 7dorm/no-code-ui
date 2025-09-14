import {BaseScreen} from "./BaseScreen.tsx";
import type {ComponentChild, ComponentProps, Context} from "preact";
import {route} from "preact-router";
import {TestBlock} from "../components/blocks/TestBlock.tsx";

export class HomeScreen extends BaseScreen {
    objects: Array<TestBlock> = [
    ];
    constructor(props?: ComponentProps<any>, context?: Context<any>) {
        super(props, context);
        console.log(context);

    }

    render(): ComponentChild {
        return (
            <div>
                <h1>This is template of the home screen</h1>
                <button onClick={() => {route("/help")}}>Click here</button>
                <button onClick={() => {route("/bot/1000230234")}}>Bot test</button>
                <TestBlock/>
                <TestBlock/>
                <TestBlock/>
            </div>
        );
    }
}
