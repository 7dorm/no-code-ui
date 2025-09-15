import {BaseScreen} from "./BaseScreen.tsx";
import {type ComponentChild, type ComponentProps, type Context} from "preact";
import {route} from "preact-router";

export class HomeScreen extends BaseScreen {
    constructor(props?: ComponentProps<any>, context?: Context<any>) {
        super(props, context);
    }

    render(): ComponentChild {
        return (
            <div>
                <h1>This is template of the home screen</h1>
                <button onClick={() => {route("/workspace/100")}}>Click here</button>
                <button onClick={() => {route("/bot/1000230234")}}>Bot test</button>
            </div>
        );
    }
}
