define(["Colorer", "util"], function (Colorer, util) {
    /**
     * @class Animator
     *
     * The animation state machine. This class is responsible for creating the
     * times frames and updating the canvas to display them.
     *
     * @param{Empress} empress The core class. Entry point for all metadata and
     *                tree operations.
     *
     * @returns{Animator}
     * @constructs Animator
     */
    function Animator(empress) {
        /**
         * @type {Empress}
         * The Empress state machine
         */
        this.empress = empress;

        /**
         * @type {Object}
         * Stores the legend info for each timeframe
         */
        this.legendInfo = {};

        /**
         * @type {String}
         * The metadata column that will be used to order animation frames.
         */
        this.gradientCol = null;

        /**
         * @type {String}
         * The metadata column that will be used to group samples in each frame
         * in each animation frame.
         */
        this.trajectoryCol = null;

        /**
         * @type {Object}
         * Maps each unique trajectory value to a color.
         */
        this.cm = null;

        /**
         * @type {Object}
         * Stores all the information associated with each timeframe.
         * This is fairly memory intensive. playAnimation() is set up calculate
         * the timeframes async during the animation. This data structure is
         * mainly used to make switching between timeframes when user
         * paused animation quicker.
         */
        this.gradientSteps = null;

        /**
         * @type {Number}
         * The total number of frames in the animations. This is mainly to make
         * code shorted. It might be better to just use timeframes.length.
         * Storing totalFrames in a seperate variable may lead to errors if they
         * become unsynced.
         */
        this.totalFrames = null;

        /**
         * @type {Number}
         * Stores the current timeframe
         */
        this.curFrame = null;

        /**
         * @type {number}
         * The total duration of the animation in milliseconds.
         */
        this.TOTAL_TIME = 30000;

        /**
         * @type {number}
         * The time between each time frame
         */
        this.timePerFram = -1;

        /**
         * @type {Object}
         * If index i === true, then frame i is ready to be displayed
         */
        this.framesRdy = null;

        /**
         * @type {Object}
         * Stores the timeframes
         */
        this.queuedFrames = null;

        /**
         * @type {Boolean}
         * Flag for animation
         */
        this.pause = true;

        /**
         * @type {Boolean}
         * Collapse clades if true.
         */
        this.collapse = false;

        /**
         * @type {Number}
         * Extra width for branches.
         */
        this.lWidth = 0;
    }

    /**
     * Sets the parameters for the animation state machine.
     *
     * @param {String} trajectory Metadata column to use for trajectory
     * @param {String} gradient Metadata column to user for gradient
     * @param {String} cm The color map to use for the animation
     * @param {Boolean} collapse Tells animator to collapse clades
     * @param {Number} lWidth Tells animator how thick to make colored tree
     *                        branches
     * @param{Boolean} reverse Defaults to false. If true, the color scale
     *                         will be reversed, with respect to its default
     *                         orientation.
     */
    Animator.prototype.setAnimationParameters = function (
        trajectory,
        gradient,
        cm,
        collapse,
        lWidth,
        reverse = false
    ) {
        this.gradientCol = gradient;
        this.gradientSteps = this.empress.getUniqueSampleValues(gradient);
        this.totalFrames = Object.keys(this.gradientSteps).length;
        this.curFrame = 0;

        // each timeframe will be displayed for same amount of time
        this.timePerFram = this.TOTAL_TIME / this.totalFrames;

        // Retrive list of unique categories to display during the animation.
        this.trajectoryCol = trajectory;
        var trajectories = this.empress.getUniqueSampleValues(trajectory);
        // Assign a color to each unique category
        var colorer = new Colorer(
            cm,
            trajectories,
            undefined,
            undefined,
            reverse
        );
        this.cm = colorer.getMapRGB();
        this.legendInfo = colorer.getMapHex();

        this.collapse = collapse;
        this.lWidth = lWidth;
    };

    /**
     * Clears state parameters
     */
    Animator.prototype.__resetParams = function () {
        this.gradientCol = null;
        this.trajectoryCol = null;
        this.cm = null;
        this.legendInfo = {};
        this.gradientSteps = null;
        this.totalFrames = null;
        this.curFrame = null;
        this.lWidth = 0;
        this.collapse = false;
        this.timePerFram = -1;
        this.framesRdy = null;
        this.queuedFrames = null;
        this.pause = true;
    };

    /**
     * Set thickness of colored branches
     *
     * @param {Number} lWidth How thick to make branches
     */
    Animator.prototype.setLineWidth = function (lWidth) {
        this.lWidth = lWidth;
    };

    /**
     * Set the collapse status of clades
     *
     * @param {Boolean} collapse If true, then Animator will collapse clades
     */
    Animator.prototype.setCollapse = function (collapse) {
        this.collapse = collapse;
    };

    /**
     * Collect a frame in the animation and stores it in the
     * queuedFrames object.
     *
     * @param{Number} frame The frame to retrieve. frame must be in the range
     *                      [0, totalFrames] else an error will be thrown.
     *
     * @private
     */
    Animator.prototype._collectFrame = function (frame) {
        if (frame < 0 || frame >= this.totalFrames) throw "Invalid Frame";
        this.queuedFrames[frame] = this.retriveFrame(frame);
        this.framesRdy[frame] = true;
    };

    /**
     * Draws the current frame and updates the legend.
     */
    Animator.prototype.drawFrame = function (showColors) {
        if (this.queuedFrames === null) {
            return;
        }
        var frame = this.queuedFrames[this.curFrame];
        var name = `${frame.name} (${this.curFrame + 1} / ${this.totalFrames})`;
        var keyInfo = frame.keyInfo;
        var obs = frame.obs;

        if (Object.keys(keyInfo).length === 0) {
            util.toastMsg("No unique branches found for this frame");
        }

        // draw new legend
        this.empress.updateLegendCategorical(name, keyInfo);

        // draw tree
        this.empress.resetTree();
        this.empress._colorTree(obs, this.cm);
        this.empress.assignGroups(obs);
        if (this.collapse) {
            this.empress.collapseClades();
        }
        this.empress.thickenColoredNodes(this.lWidth);
        this.empress.drawTree();
    };

    /**
     * Draw the tree corresponding a given frame.
     *
     * This method is used in empire plots, and won't draw a legend since the
     * color values are visible in Emperor.
     *
     * @param{Number} frame The frame to retrieve. frame must be in the range
     *                      [0, this.totalFrames) else an error will be thrown.
     */
    Animator.prototype.showAnimationFrameAtIndex = function (frame) {
        if (frame < 0 || frame >= this.totalFrames) throw "Invalid Frame";

        this.curFrame = frame;
        if (!this.framesRdy[frame]) {
            this._collectFrame(frame);
        }

        this.drawFrame();
    };

    /**
     * The animation loop. This method will continously create timeout events
     * until the animation is done or user pauses/stops the animation.
     */
    Animator.prototype.playAnimation = function () {
        // used in closure
        var scope = this;

        // Animation loop
        setTimeout(function loop() {
            if (!scope.pause && scope.curFrame + 1 < scope.totalFrames) {
                if (!scope.framesRdy[scope.curFrame + 1]) {
                    scope._collectFrame(scope.curFrame + 1);
                }
                scope.nextFrame();
                setTimeout(loop, scope.timePerFram);
            } else if (
                !scope.pause &&
                scope.curFrame + 1 === scope.totalFrames
            ) {
                util.toastMsg("Animation Complete.");
            }
        }, 0);
    };

    /**
     * Initialize the animation properties.
     */
    Animator.prototype.initAnimation = function () {
        this.curFrame = -1;
        this.pause = false;
        this.framesRdy = new Array(this.totalFrames).fill(false);
        this.queuedFrames = [];
    };

    /**
     * This method is the entry point for the animation. This method will
     * start the animation loop.
     */
    Animator.prototype.startAnimation = function () {
        this.initAnimation();

        // start animation loop
        // Note: This method is async and will create timeout events until
        // animation is complete or user pauses.
        this.playAnimation();
    };

    /**
     * Sets the pause parameter of the state machine to true.
     */
    Animator.prototype.pauseAnimation = function () {
        this.pause = true;
    };

    /**
     * Sets the pause parameter of the state machine to false and resumes the
     * animation.
     */
    Animator.prototype.resumeAnimation = function () {
        this.pause = false;
        this.playAnimation();
    };

    /**
     * Stops the animation and clears state machine parameters
     */
    Animator.prototype.stopAnimation = function () {
        this.__resetParams();
        this.empress.clearLegend();
        this.empress.resetTree();
        this.empress.drawTree();
    };

    /**
     * Finds unique observations in the trajectory for a given timeframe. Note
     * each timeframe is defined by the gradient.
     *
     * @param{Number} frame The index in this.gradientSteps.
     *
     * @return {Object} The timeframe.
     */
    Animator.prototype.retriveFrame = function (frame) {
        // The name (or value) of current timeframe
        var name = this.gradientCol + ": " + this.gradientSteps[frame];

        // get observations in current timeframe
        var obs = this.empress.getGradientStep(
            this.gradientCol,
            this.gradientSteps[frame],
            this.trajectoryCol
        );

        var categories = Object.keys(obs);
        for (var i = 0; i < categories.length; i++) {
            category = categories[i];
            obs[category] = new Set(obs[category]);
        }
        obs = this.empress._projectObservations(
            obs,
            this.empress.ignoreAbsentTips
        );

        // add non-empty groups to the legend for this frame
        var legend = {};
        for (var group in this.legendInfo) {
            if (obs.hasOwnProperty(group))
                legend[group] = this.legendInfo[group];
        }

        return { name: name, keyInfo: legend, obs: obs };
    };

    /**
     * Retrives the sample metedata columns.
     */
    Animator.prototype.getSampleCategories = function () {
        return this.empress.getSampleCategories();
    };

    /**
     * Show the previous timeframe. This method is only called when animation
     * is paused and user presses the previous button.
     */
    Animator.prototype.prevFrame = function () {
        this.curFrame -= 1;
        if (this.curFrame < 0) {
            this.curFrame = 0;
        }
        this.drawFrame();
    };

    /**
     * Show the next timeframe. This method is only called when animation is
     * paused and user presses the next button.
     */
    Animator.prototype.nextFrame = function () {
        // make sure curFrame is not passed last frame
        this.curFrame += 1;
        if (this.curFrame >= this.totalFrames) {
            this.curFrame = this.totalFrames - 1;
        }
        if (!this.framesRdy[this.curFrame]) this._collectFrame(this.curFrame);
        this.drawFrame();
    };

    /**
     * Checks to see if state machine is on first frame
     *
     * @return {Boolean} true if animatior is on first frame
     */
    Animator.prototype.onFirstFrame = function () {
        return this.curFrame == 0;
    };

    /**
     * Checks to see if state machine is on last frame
     *
     * @return {Boolean} true if animator is on last frame (or beyond, somehow)
     */
    Animator.prototype.onLastFrame = function () {
        return this.curFrame >= this.totalFrames - 1;
    };

    return Animator;
});
