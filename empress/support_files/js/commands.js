define(["underscore"], function (_) {
    /**
     *
     * @class CommandManager
     *
     * Maintains and provides operations for manipulating a FIFO queue of commands.
     *
     * @param {Empress} empress The empress object to execute all of the commands on.
     *
     * @return {CommandManager}
     * @constructs CommandManager
     */
    function CommandManager(empress) {
        this.empress = empress;
        this.executed = [];
        this.toExecute = [];
    }

    /**
     * Adds a new command at the end of the queue
     *
     * @param {Command} command Command to be added to the queue.
     */
    CommandManager.prototype.push = function (command) {
        this.toExecute.push(command);
    };

    /**
     * Removes the first Command from the queue and executes it.
     */
    CommandManager.prototype.executeNext = function () {
        var command = this.toExecute.shift();
        command.execute(this.empress);
        this.executed.push(command);
    };

    /**
     * Executes all commands that have yet to be executed.
     */
    CommandManager.prototype.executeAll = function () {
        while (this.toExecute.length > 0) {
            this.executeNext();
        }
    };

    /**
     * Adds a command to the queue then executes everything that has yet
     * to be executed.
     *
     * @param {Command} command Command to be executed.
     */
    CommandManager.prototype.pushAndExecuteAll = function (command) {
        this.toExecute.push(command);
        this.executeAll();
    };

    /**
     * Encapsulates the information needed to perform an action.
     * @class Command
     */
    class Command {
        /**
         * Validates props and then assigns them to this object.
         *
         * @param {Object} props Contains the properties needed to perform the action.
         *                       Defaults to empty object
         */
        constructor(props = {}) {
            this.constructor.validateProps(props);
            Object.assign(this, props);
        }

        /**
         * Validates the properties passed to the constructor. Should throw
         * an error if there is a violation.
         *
         * @param props {Object} props Properties that need to be validated
         */
        static validateProps(props) {}

        /**
         * Executes the action specified by the command.
         * @param controller An object that is needed at runtime for the command.
         */
        execute(controller) {}
    }

    /**
     * Initializes and executes a command.
     *
     * @param {Class} commandClass The class of the command to instantiate
     * @param {Object} props Contains the properties needed to perform the action.
     * @param controller An object that is need at runtime for the command.
     */
    function initAndExecute(commandClass, props, controller) {
        var command = new commandClass(props);
        command.execute(controller);
    }

    /**
     * Checks props for required keys. Throws an error if a required key is missing.
     *
     * @param {Object} props The properties to check.
     * @param {Array} required The keys that are required in props.
     */
    function checkRequired(props, required) {
        required.forEach(function (name) {
            if (!(name in props)) {
                throw "Required: '" + name + "' not in props";
            }
        });
    }

    /**
     * A command that performs no validation and does nothing in its execute call.
     *
     * @class NullCommand
     */
    class NullCommand extends Command {
        /**
         * Performs no validation.
         * @param {Object} props
         */
        static validateProps(props) {}

        /**
         * Performs no action.
         * @param controller
         */
        execute(controller) {}
    }

    /**
     * Sets the color of the empress tree back to default.
     */
    class ResetTreeCommand extends Command {
        execute(empress) {
            empress.resetTree();
        }
    }

    var requiredColorProps = ["colorBy", "colorMapName", "coloringMethod"];

    /**
     * Colors the tree by feature metadata
     *
     * @class ColorByFeatureMetadataCommand
     *
     */
    class ColorByFeatureMetadataCommand extends Command {
        /**
         * @param {Object} props Properties to use for coloring based on feature metadata
         * @param {string} props.colorBy Category to color based on.
         * @param {string} props.colorMapName Name of color map to use.
         * @param {string} props.coloringMethod Method to use for coloring.
         * @param {Boolean} props.reverseColorMap (optional) Indicates whether the the color
         *                                        map should be reverse.
         */
        constructor(props) {
            super(props);
        }

        /**
         * Ensures props contain enough information to execute the command.
         *
         * @param {Object} props passed to this objects constructor.
         */
        static validateProps(props) {
            super.validateProps(props);
            checkRequired(props, requiredColorProps);
        }

        /**
         * Colors the empress object by feature metadata
         *
         * @param {Empress} empress The empress object to color by feature metadata
         */
        execute(empress) {
            empress.colorByFeatureMetadata(
                this.colorBy,
                this.colorMapName,
                this.coloringMethod,
                this.reverseColorMap
            );
        }
    }

    /**
     * Collapses the clades of an empress object.
     */
    class CollapseCladesCommand extends Command {
        /**
         * Executes the clade collapse
         * @param {Empress} empress The empress object to collapse.
         */
        execute(empress) {
            empress.collapseClades();
        }
    }

    var requiredThickenProps = ["lineWidth"];

    /**
     * Thickens the colored branches of the empress object
     */
    class ThickenColoredNodesCommand extends Command {
        /**
         *
         * @param {Object} props Properties to use for thickening the branches
         * @param {Number} props.lineWidth Amount of thickness to use.
         */
        constructor(props) {
            super(props);
        }

        /**
         *
         * @param {Object} props Properties to validate.
         */
        static validateProps(props) {
            super.validateProps(props);
            checkRequired(props, requiredThickenProps);
        }

        /**
         * Executes the node thickening.
         *
         * @param {Empress} empress The Empress object to thicken the nodes of.
         */
        execute(empress) {
            empress.thickenColoredNodes(this.lineWidth);
        }
    }

    /**
     * Command for drawing the tree.
     */
    class DrawTreeCommand extends Command {
        /**
         * Executes the tree drawing.
         * @param {Empress} empress The Empress object to draw the tree of.
         */
        execute(empress) {
            empress.drawTree();
        }
    }

    /**
     * A convenience class for chaining commands, that is a Command itself.
     */
    class CompositeCommand extends Command {
        constructor(props) {
            super(props);
            this.commands = [];
        }

        execute(controller) {
            this.commands.forEach(function (command) {
                command.execute(controller);
            });
        }
    }

    /**
     * Composite pipeline for performing multiple steps of coloring a tree by feature metadata
     */
    class ColorByFeatureMetadataPipeline extends CompositeCommand {
        /**
         *
         * @param {Object} props Properties used to color the tree by metadata.
         * @param {string} props.colorBy Category to color based on.
         * @param {string} props.colorMapName Name of color map to use.
         * @param {string} props.coloringMethod Method to use for coloring.
         * @param {Number} props.lineWidth Amount of thickness to use.
         * @param {Boolean} props.reverseColorMap (optional) Indicates whether the the color
         *                                        map should be reverse.
         */
        constructor(props) {
            super(props);
            var reset = new ResetTreeCommand();
            var color = new ColorByFeatureMetadataCommand({
                colorBy: this.colorBy,
                colorMapName: this.colorMapName,
                coloringMethod: this.coloringMethod,
                reverseColorMap: this.reverseColorMap,
            });
            var collapse;
            if (this.collapseClades) {
                collapse = new CollapseCladesCommand();
            } else {
                // Command is the null command
                collapse = new NullCommand();
            }
            var thicken = new ThickenColoredNodesCommand({
                lineWidth: this.lineWidth,
            });
            var draw = new DrawTreeCommand();

            this.commands = [reset, color, collapse, thicken, draw];
        }
    }

    return {
        CollapseCladesCommand: CollapseCladesCommand,
        ColorByFeatureMetadataCommand: ColorByFeatureMetadataCommand,
        ColorByFeatureMetadataPipeline: ColorByFeatureMetadataPipeline,
        CommandManager: CommandManager,
        DrawTreeCommand: DrawTreeCommand,
        NullCommand: NullCommand,
        ResetTreeCommand: ResetTreeCommand,
        ThickenColoredNodesCommand: ThickenColoredNodesCommand,
    };
});
