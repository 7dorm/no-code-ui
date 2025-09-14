import {BaseScreen} from "./BaseScreen.tsx";
import type {ComponentProps, Context} from "preact";
import type {JSX} from "preact";

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
            </>
        );
    }
}
