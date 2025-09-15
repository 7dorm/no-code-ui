import {BaseBlock} from "./BaseBlock";
import '../../styles/components/blocks/blocks.css';

export class TestBlock extends BaseBlock {
    static displayName = "TestBlock";

    renderBlock() {
        return (
            <div className="glass-element">
                <h1>HEllo</h1>,
            </div>
        );
    }
}
