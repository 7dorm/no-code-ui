import {BaseScreen} from "./BaseScreen.tsx";
import type {ComponentChild, ComponentChildren, ComponentProps, Context, RenderableProps} from "preact";
import {route} from "preact-router";

export class WorkspaceScreen extends BaseScreen {
    constructor(props?: ComponentProps<any>, context?: Context<any>) {
        super(props, context);
        console.log(context);
    }

    render(): ComponentChildren {
        return (
            <div>

            </div>
        );
    }
}
