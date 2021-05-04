require([
    "jquery",
    "AnimationPanel",
    "Animator",
    "BPTree",
    "Empress",
    "BiomTable",
    "Legend",
    "util",
    "Colorer",
], function (
    $,
    AnimationPanel,
    Animator,
    BPTree,
    Empress,
    BiomTable,
    Legend,
    util,
    Colorer
) {
    module("Animation Panel Handler", {
        setup: function () {
            // add test compenents to this div
            this.div = document.getElementById("test-div");

            // setup all GUI components
            var colorSelect = document.createElement("select");
            colorSelect.setAttribute("id", "animate-color-select");
            this.div.appendChild(colorSelect);

            var reverseColorChk = document.createElement("checkbox");
            reverseColorChk.setAttribute("id", "animate-color-reverse-chk");
            this.div.appendChild(reverseColorChk);

            var gradient = document.createElement("select");
            gradient.setAttribute("id", "animate-gradient");
            this.div.appendChild(gradient);

            var trajectory = document.createElement("select");
            trajectory.setAttribute("id", "animate-trajectory");
            this.div.appendChild(trajectory);

            var collapseChk = document.createElement("checkbox");
            collapseChk.setAttribute("id", "animate-collapse-chk");
            collapseChk.setAttribute("value", false);
            this.div.appendChild(collapseChk);

            var lWidth = document.createElement("number");
            lWidth.setAttribute("id", "animate-line-width");
            lWidth.setAttribute("value", 1);
            this.div.appendChild(lWidth);

            var startBtnP = document.createElement("button");
            startBtnP.setAttribute("id", "animate-start-btn-p");
            this.div.appendChild(startBtnP);

            var stopBtnP = document.createElement("button");
            stopBtnP.setAttribute("id", "animate-stop-btn-p");
            this.div.appendChild(stopBtnP);

            var pauseBtnP = document.createElement("button");
            pauseBtnP.setAttribute("id", "animate-pause-btn-p");
            this.div.appendChild(pauseBtnP);

            var rpnBtnP = document.createElement("button");
            rpnBtnP.setAttribute("id", "animate-resume-prev-next-btn-p");
            this.div.appendChild(rpnBtnP);

            var startBtn = document.createElement("button");
            startBtn.setAttribute("id", "animate-start-btn");
            this.div.appendChild(startBtn);

            var stopBtn = document.createElement("button");
            stopBtn.setAttribute("id", "animate-stop-btn");
            this.div.appendChild(stopBtn);

            var pauseBtn = document.createElement("button");
            pauseBtn.setAttribute("id", "animate-pause-btn");
            this.div.appendChild(pauseBtn);

            var resumeBtn = document.createElement("button");
            resumeBtn.setAttribute("id", "animate-resume-btn");
            this.div.appendChild(resumeBtn);

            var prevFrameBtn = document.createElement("button");
            prevFrameBtn.setAttribute("id", "animate-prev-btn");
            this.div.appendChild(prevFrameBtn);

            var nextFrameBtn = document.createElement("button");
            nextFrameBtn.setAttribute("id", "animate-next-btn");
            this.div.appendChild(nextFrameBtn);

            // need to set up a BIOM table with at least one sample so
            // animation-panel-handler can extract the sample fields
            var sIDs = ["s1"];
            var fIDs = ["o1"];
            var sID2Idx = { s1: 0 };
            var fID2Idx = { o1: 0 };
            var tbl = [[0]];
            var smCols = ["f1", "grad", "traj"];
            var sm = [["asdf", "asdf", "asdf"]];
            var biom = new BiomTable(
                sIDs,
                fIDs,
                sID2Idx,
                fID2Idx,
                tbl,
                smCols,
                sm
            );
            var empress = new Empress({ size: 0 }, biom, [], [], {}, {}, null);
            var animator = new Animator(
                empress,
                new Legend(
                    document.createElement("div"),
                    document.createElement("div"),
                    document.createElement("div")
                )
            );

            // Note: we don't tests the click events for each button because we
            //       are assuming the animator will behave correctly. The only
            //       thing the click events do are call
            //       animator/animation-panel-handler functions. Thus, if the
            //       animation-panel-handler functions are correct, we can
            //       assume the click events are correct.

            // create animate-panel
            this.panel = new AnimationPanel(animator);
        },

        teardown: function () {
            this.panel = null;
            while (this.div.firstChild) {
                this.div.removeChild(this.div.firstChild);
            }
        },
    });

    test("setOnAnimationStarted", function (assert) {
        // Exactly two assertions should be run within this test
        assert.expect(2);
        this.panel.addAnimationTab();

        this.panel.setOnAnimationStarted(function () {
            assert.ok(true);
        });

        ok(this.panel._onAnimationStarted !== null);
        // note we can't call startBtn because this module does not create a
        // working animator object (see notes in the setup)
        this.panel._onAnimationStarted();
    });

    test("setOnAnimationStopped", function (assert) {
        assert.expect(2);
        this.panel.addAnimationTab();

        this.panel.setOnAnimationStopped(function () {
            assert.ok(true);
        });

        ok(this.panel._onAnimationStopped !== null);
        // note we can't call stopBtn because this module does not create a
        // working animator object (see notes in the setup)
        this.panel._onAnimationStopped();
    });

    test("setEnabled", function () {
        notOk(this.panel.colorSelect.disabled);
        notOk(this.panel.reverseColorChk.disabled);
        notOk(this.panel.gradient.disabled);
        notOk(this.panel.trajectory.disabled);

        notOk(this.panel.collapseChk.disabled);
        notOk(this.panel.lWidth.disabled);

        notOk(this.panel.pauseBtn.disabled);
        notOk(this.panel.startBtn.disabled);
        notOk(this.panel.stopBtn.disabled);
        notOk(this.panel.resumeBtn.disabled);
        notOk(this.panel.prevFrameBtn.disabled);
        notOk(this.panel.nextFrameBtn.disabled);

        this.panel.setEnabled(true);

        notOk(this.panel.colorSelect.disabled);
        notOk(this.panel.reverseColorChk.disabled);
        notOk(this.panel.gradient.disabled);
        notOk(this.panel.trajectory.disabled);

        notOk(this.panel.collapseChk.disabled);
        notOk(this.panel.lWidth.disabled);

        notOk(this.panel.pauseBtn.disabled);
        notOk(this.panel.startBtn.disabled);
        notOk(this.panel.stopBtn.disabled);
        notOk(this.panel.resumeBtn.disabled);
        notOk(this.panel.prevFrameBtn.disabled);
        notOk(this.panel.nextFrameBtn.disabled);

        this.panel.setEnabled(false);

        ok(this.panel.colorSelect.disabled);
        ok(this.panel.reverseColorChk.disabled);
        ok(this.panel.gradient.disabled);
        ok(this.panel.trajectory.disabled);

        notOk(this.panel.collapseChk.disabled);
        notOk(this.panel.lWidth.disabled);

        ok(this.panel.pauseBtn.disabled);
        ok(this.panel.startBtn.disabled);
        ok(this.panel.stopBtn.disabled);
        ok(this.panel.resumeBtn.disabled);
        ok(this.panel.prevFrameBtn.disabled);
        ok(this.panel.nextFrameBtn.disabled);
    });

    test("startOptions", function () {
        this.panel.startOptions();
        // the following should be hidden
        ok(this.panel.stopBtnP.classList.contains("hidden"));
        ok(this.panel.pauseBtnP.classList.contains("hidden"));
        ok(this.panel.rpnBtnP.classList.contains("hidden"));

        // show the following buttons
        ok(!this.panel.startBtnP.classList.contains("hidden"));
    });

    test("__pauseOptions", function () {
        this.panel.__pauseOptions();
        // the following should be hidden
        ok(this.panel.startBtnP.classList.contains("hidden"));
        ok(this.panel.rpnBtnP.classList.contains("hidden"));

        // show the following buttons
        ok(!this.panel.stopBtnP.classList.contains("hidden"));
        ok(!this.panel.pauseBtnP.classList.contains("hidden"));
    });

    test("__resumeOptions", function () {
        // set up so that animator state machine is on first frame
        this.panel.animator.totalFrames = 3;

        // Note: this used to be 1 but the animator class has been updated
        this.panel.animator.curFrame = 0;
        this.panel.__resumeOptions();

        // the followinng should be hidden
        ok(
            this.panel.pauseBtnP.classList.contains("hidden"),
            "pause button's container should be hidden"
        );
        ok(
            this.panel.startBtnP.classList.contains("hidden"),
            "start button's container should be hidden"
        );

        // show the following buttons
        ok(
            !this.panel.stopBtnP.classList.contains("hidden"),
            "stop button's container should be visible"
        );
        ok(
            !this.panel.rpnBtnP.classList.contains("hidden"),
            "resume/pause/next buttons' containers should be visible"
        );

        // animator should be on first frame

        // if animator is on first frame then prevFrameBtn should be disabled
        // and next frame should be enabled
        ok(
            this.panel.prevFrameBtn.disabled,
            "previous button should be disabled"
        );
        ok(!this.panel.nextFrameBtn.disabled, "next button should be enabled");

        // set animator to a middle frame
        this.panel.animator.curFrame = 1;
        this.panel.__resumeOptions();

        // if animator is on a middle frame then prev/nextFrameBtn should
        // be enabled
        ok(
            !this.panel.prevFrameBtn.disabled,
            "previous button should be enabled"
        );
        ok(!this.panel.nextFrameBtn.disabled, "next button should be enabled");

        // set animator to last frame
        this.panel.animator.curFrame = 2;
        this.panel.__resumeOptions();

        // if animator is on last frame then prevFrameBtn should be enabled
        // and next frame should be disabled
        ok(!this.panel.prevFrameBtn.disabled);
        ok(this.panel.nextFrameBtn.disabled);
    });

    test("_toggleSelects, true", function () {
        this.panel._toggleSelects(true);
        ok(this.panel.colorSelect.disabled);
        ok(this.panel.reverseColorChk.disabled);
        ok(this.panel.gradient.disabled);
        ok(this.panel.trajectory.disabled);
    });

    test("_toggleSelects, false", function () {
        this.panel._toggleSelects(false);
        ok(!this.panel.colorSelect.disabled);
        ok(!this.panel.reverseColorChk.disabled);
        ok(!this.panel.gradient.disabled);
        ok(!this.panel.trajectory.disabled);
    });

    test("addAnimationTab", function () {
        this.panel.addAnimationTab();

        // make sure the events were created
        ok(this.panel.lWidth.onchange !== null);
        ok(this.panel.startBtn.onclick !== null);
        ok(this.panel.pauseBtn.onclick !== null);
        ok(this.panel.resumeBtn.onclick !== null);
        ok(this.panel.stopBtn.onclick !== null);
        ok(this.panel.prevFrameBtn.onclick !== null);
        ok(this.panel.nextFrameBtn !== null);

        equal(this.panel.animator.lWidth, 0);
        equal(this.panel.animator.collapse, false);

        // make sure an option was created for each color
        var expectedColors = Colorer.__Colormaps;
        var resultColors = this.panel.colorSelect.options;
        ok(resultColors.length === expectedColors.length);
        for (var i = 1; i < resultColors.length; i++) {
            ok(resultColors.name === expectedColors.name);
        }

        // make sure gradient menu has an option for each sample field
        var expectedFields = ["f1", "grad", "traj"];
        var resultFields = this.panel.gradient.options;
        ok(resultFields.length === expectedFields.length);
        for (i = 0; i < resultFields.length; i++) {
            ok(resultFields[i].value === expectedFields[i]);
        }

        // make sure trajectory menu has an option for each sample field
        expectedFields = ["f1", "grad", "traj"];
        resultFields = this.panel.trajectory.options;
        ok(resultFields.length === expectedFields.length);
        for (i = 0; i < resultFields.length; i++) {
            ok(resultFields[i].value === expectedFields[i]);
        }
    });
});
