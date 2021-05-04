define(["Colorer", "util"], function (Colorer, util) {
    /**
     *
     * @class AnimationPanel
     *
     * Creates tab for the animation panel and handles their events events.
     *
     * @param{Object} animator The object that creates the animations
     *
     * @return {AnimationPanel}
     * construct AnimationPanel
     */
    function AnimationPanel(animator) {
        // used in event triggers
        this.animator = animator;

        // animation GUI components
        this.colorSelect = document.getElementById("animate-color-select");
        this.reverseColorChk = document.getElementById(
            "animate-color-reverse-chk"
        );
        this.gradient = document.getElementById("animate-gradient");
        this.trajectory = document.getElementById("animate-trajectory");
        this.collapseChk = document.getElementById("animate-collapse-chk");
        this.lWidth = document.getElementById("animate-line-width");
        this.startBtn = document.getElementById("animate-start-btn");
        this.stopBtn = document.getElementById("animate-stop-btn");
        this.pauseBtn = document.getElementById("animate-pause-btn");
        this.resumeBtn = document.getElementById("animate-resume-btn");
        this.prevFrameBtn = document.getElementById("animate-prev-btn");
        this.nextFrameBtn = document.getElementById("animate-next-btn");

        this.startBtnP = document.getElementById("animate-start-btn-p");
        this.stopBtnP = document.getElementById("animate-stop-btn-p");
        this.pauseBtnP = document.getElementById("animate-pause-btn-p");
        this.rpnBtnP = document.getElementById(
            "animate-resume-prev-next-btn-p"
        );

        /**
         * @type {Function}
         * Function to execute when an animation starts.
         * @private
         */
        this._onAnimationStarted = null;

        /**
         * @type {Function}
         * Function to execute when an animation stops.
         * @private
         */
        this._onAnimationStopped = null;
    }

    /**
     * Makes the play button visible. This is the menu shown before user has
     * started the animation.
     */
    AnimationPanel.prototype.startOptions = function () {
        // hide the following buttons
        this.stopBtnP.classList.add("hidden");
        this.pauseBtnP.classList.add("hidden");
        this.rpnBtnP.classList.add("hidden");

        // show the following buttons
        this.startBtnP.classList.remove("hidden");
    };

    /**
     * Makes the stop/pause buttons visible. This is the menu shown during the
     * animation.
     *
     * @private
     */
    AnimationPanel.prototype.__pauseOptions = function () {
        // hide the following buttons
        this.startBtnP.classList.add("hidden");
        this.rpnBtnP.classList.add("hidden");

        // show the following buttons
        this.stopBtnP.classList.remove("hidden");
        this.pauseBtnP.classList.remove("hidden");
    };

    /**
     * Makes the prev/next/stop/resume buttons visible. This is the menu shown
     * when user pauses the animation.
     *
     * @private
     */
    AnimationPanel.prototype.__resumeOptions = function () {
        // hide the following buttons
        this.pauseBtnP.classList.add("hidden");
        this.startBtnP.classList.add("hidden");

        // show the following buttons
        this.stopBtnP.classList.remove("hidden");
        this.rpnBtnP.classList.remove("hidden");

        // dont show previous button on frame 1
        this.prevFrameBtn.disabled = this.animator.onFirstFrame();

        // dont show next button on last frame
        this.nextFrameBtn.disabled = this.animator.onLastFrame();
    };

    /**
     * Enables/disable the drop down menus. When the animation is playing,
     * the drop down menus are disabled in order to prevent user from changing
     * the gradient/trajectory during an animation.
     *
     * @private
     */
    AnimationPanel.prototype._toggleSelects = function (disableStatus) {
        this.colorSelect.disabled = disableStatus;
        this.reverseColorChk.disabled = disableStatus;
        this.gradient.disabled = disableStatus;
        this.trajectory.disabled = disableStatus;
    };

    /**
     * Enable/disable all the UI elements in the panel except for the line
     * width control and the clade collapsing checkbox.
     *
     * @param{Bool} enabled Whether controls should be enabled (true) or
     *                      disabled (false).
     */
    AnimationPanel.prototype.setEnabled = function (enabled) {
        var isDisabled = !enabled;
        this.colorSelect.disabled = isDisabled;
        this.reverseColorChk.disabled = isDisabled;
        this.gradient.disabled = isDisabled;
        this.trajectory.disabled = isDisabled;

        this.pauseBtn.disabled = isDisabled;
        this.startBtn.disabled = isDisabled;
        this.stopBtn.disabled = isDisabled;
        this.resumeBtn.disabled = isDisabled;
        this.prevFrameBtn.disabled = isDisabled;
        this.nextFrameBtn.disabled = isDisabled;
    };

    /**
     * Set a callback to execute when an animation is started.
     *
     * @param {Function} callback Callback to execute when an animation starts.
     */
    AnimationPanel.prototype.setOnAnimationStarted = function (callback) {
        this._onAnimationStarted = callback;
    };

    /**
     * Set a callback to execute when an animation completes.
     *
     * @param {Function} callback Callback to execute when an animation
     *                            stops.
     */
    AnimationPanel.prototype.setOnAnimationStopped = function (callback) {
        this._onAnimationStopped = callback;
    };

    /**
     * Initializes GUI components/set up callback events
     */
    AnimationPanel.prototype.addAnimationTab = function () {
        // used in closures
        var scope = this;

        // hide play/pause/next/previous/stop buttons
        this.startOptions();

        // The color map selector
        Colorer.addColorsToSelect(this.colorSelect);

        // retrive gradient/trajectory categories
        var categories = this.animator.getSampleCategories();

        // add categories options to gradient drop down menu
        for (var i = 0; i < categories.length; i++) {
            var opt = document.createElement("option");
            opt.value = categories[i];
            opt.innerHTML = categories[i];
            this.gradient.appendChild(opt);
        }

        // copy options and add them to trajectory drop down menu
        var options = this.gradient.innerHTML;
        this.trajectory.innerHTML = options;

        /**
         * Event: triggers when user changes value of collapse check box
         * Sets collapse parameter in the animation state machine
         */
        this.collapseChk.onclick = function () {
            scope.animator.setCollapse(this.checked);
            scope.animator.drawFrame();
        };

        /**
         * Event: triggers when user changes value of line width.
         * Sets line width parameter in animation state machine.
         */
        this.lWidth.onchange = function () {
            var lw = util.parseAndValidateNum(scope.lWidth);
            // pass line width to state machine
            scope.animator.setLineWidth(lw);
            scope.animator.drawFrame();
        };

        /**
         * Event: triggers when user clicks on the start button.
         * Starts the animation.
         *
         * @return {null}
         */
        this.startBtn.onclick = function () {
            // change GUI components
            scope._toggleSelects(true);
            scope.__pauseOptions();

            // run a callback once the animation starts
            if (scope._onAnimationStarted !== null) {
                scope._onAnimationStarted();
            }

            // collect starting conditions for the animation
            var gradient = scope.gradient.value;
            var trajectory = scope.trajectory.value;
            var cm = scope.colorSelect.value;
            var reverse = scope.reverseColorChk.checked;
            var collapse = scope.collapseChk.checked;
            var lWidth = scope.lWidth.value;

            // pass parameters to state machine
            scope.animator.setAnimationParameters(
                trajectory,
                gradient,
                cm,
                collapse,
                lWidth,
                reverse
            );

            // start animation
            scope.animator.startAnimation();
        };

        /**
         * Event: triggers when user clicks on pause button.
         * Pauses the animation.
         */
        this.pauseBtn.onclick = function () {
            scope.__resumeOptions();
            scope.animator.pauseAnimation();
        };

        /**
         * Event: triggers when user clicks on resume button.
         * Resumes the animation.
         */
        this.resumeBtn.onclick = function () {
            scope.__pauseOptions();
            scope.animator.resumeAnimation();
        };

        /**
         * Event: triggers when user clicks on stop button.
         * Stops the animation and clears the state machine
         */
        this.stopBtn.onclick = function () {
            scope._toggleSelects(false);
            scope.startOptions();
            scope.animator.stopAnimation();

            // run a callback once the animation starts
            if (scope._onAnimationStopped !== null) {
                scope._onAnimationStopped();
            }
        };

        /**
         * Event: triggers when user clicks on previous button.
         * Shows the previous frame in the animation
         */
        this.prevFrameBtn.onclick = function () {
            scope.animator.prevFrame();
            scope.__resumeOptions();
        };

        /**
         * Event: triggers when user clicks on next button.
         * Shows the next frame in the animation.
         */
        this.nextFrameBtn.onclick = function () {
            scope.animator.nextFrame();
            scope.__resumeOptions();
        };
    };

    return AnimationPanel;
});
