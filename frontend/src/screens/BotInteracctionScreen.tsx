import {BaseScreen} from "./BaseScreen.tsx";
import type {ComponentProps, Context} from "preact";
import type {JSX} from "preact";
import {route} from "preact-router";

export class BotInteracctionScreen extends BaseScreen {
    constructor(props?: ComponentProps<any>, context?: Context<any>) {
        super(props, context);
        console.log(context);
    }

    render(props: ComponentProps<any>): JSX.Element {
        console.log(props);
        return (
            <>
                <h1>BOT ID is {props.id}</h1>
                <button onClick={() => {route("/")}}>Go back</button>
            </>
        );
    }
}
