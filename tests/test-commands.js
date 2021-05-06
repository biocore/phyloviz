require(["jquery", "Commands"], function ($, Commands) {
    $(document).ready(function () {
        module("Commands", {
            setup: function () {
                var setupScope = this;
                this.treeDefaults = {
                    reset: 0,
                    colorCategory: null,
                    colorMap: null,
                    coloringMethod: null,
                    reverse: false,
                    collapsed: false,
                    lineThickness: 0,
                    drawn: false,
                };
                class MockEmpress {
                    constructor() {
                        var scope = this;
                        Object.keys(setupScope.treeDefaults).forEach((key) => {
                            var value = setupScope.treeDefaults[key];
                            scope[key] = value;
                        });
                    }

                    resetTree() {
                        var scope = this;
                        this.reset = this.reset + 1;
                        Object.keys(setupScope.treeDefaults).forEach((key) => {
                            if (key !== "reset") {
                                var value = setupScope.treeDefaults[key];
                                scope[key] = value;
                            }
                        });
                    }

                    colorByFeatureMetadata(
                        colorBy,
                        colorMapName,
                        coloringMethod,
                        reverse = false
                    ) {
                        this.colorCategory = colorBy;
                        this.colorMap = colorMapName;
                        this.coloringMethod = coloringMethod;
                        this.reverse = reverse;
                    }

                    collapseClades() {
                        this.collapsed = true;
                    }

                    thickenColoredNodes(lineWidth) {
                        this.lineThickness = lineWidth;
                    }

                    drawTree() {
                        this.drawn = true;
                    }
                }

                this.MockEmpress = MockEmpress;
            },
            teardown: function () {
                this.MockEmpress = null;
            },
        });

        test("Test ResetTreeCommand", function () {
            var empress = new this.MockEmpress();
            var resetCommand = new Commands.ResetTreeCommand();
            resetCommand.execute(empress);
            equal(empress.reset, 1);
            resetCommand.execute(empress);
            equal(empress.reset, 2);
        });

        test("Test NullCommand", function () {
            var empress = new this.MockEmpress();
            var nullCommand = new Commands.NullCommand();
            nullCommand.execute(empress);
            // cannot use equal function on treeDefaults and empress
            Object.keys(this.treeDefaults).forEach((key) => {
                var exp = this.treeDefaults[key];
                var obs = empress[key];
                equal(obs, exp, key);
            });
        });

        test("Test ColorByFeatureMetadataCommand", function () {
            var empress = new this.MockEmpress();
            var colorCommand = new Commands.ColorByFeatureMetadataCommand({
                colorBy: "color-category",
                colorMapName: "gimme-color-map-name",
                coloringMethod: "gimme-method",
            });
            colorCommand.execute(empress);

            equal(empress.colorCategory, "color-category");
            equal(empress.colorMap, "gimme-color-map-name");
            equal(empress.coloringMethod, "gimme-method");
            equal(empress.reverse, false);
        });

        test("Test ColorByFeatureMetadataCommand (reverse = true)", function () {
            var empress = new this.MockEmpress();
            var colorCommand = new Commands.ColorByFeatureMetadataCommand({
                colorBy: "color-category",
                colorMapName: "gimme-color-map-name",
                coloringMethod: "gimme-method",
                reverseColorMap: true,
            });
            colorCommand.execute(empress);

            equal(empress.colorCategory, "color-category");
            equal(empress.colorMap, "gimme-color-map-name");
            equal(empress.coloringMethod, "gimme-method");
            equal(empress.reverse, true);
        });

        test("Test CollapaseCladesCommand", function () {
            var empress = new this.MockEmpress();
            var collapse = new Commands.CollapseCladesCommand();
            notOk(empress.collapsed);
            collapse.execute(empress);
            ok(empress.collapsed);
        });

        test("Test ThickenColoredNodesCommand", function () {
            var empress = new this.MockEmpress();
            var thicken = new Commands.ThickenColoredNodesCommand({
                lineWidth: 7.24,
            });

            thicken.execute(empress);
            equal(empress.lineThickness, 7.24);
        });

        test("Test DrawTreCommand", function () {
            var empress = new this.MockEmpress();
            var draw = new Commands.DrawTreeCommand();
            notOk(empress.drawn);
            draw.execute(empress);
            ok(empress.drawn);
        });

        test("Test ColorByFeatureMetadataPipeline", function () {
            var empress = new this.MockEmpress();
            var pipeline = new Commands.ColorByFeatureMetadataPipeline({
                colorBy: "gimme-category",
                colorMapName: "map-name",
                coloringMethod: "some-method",
                lineWidth: 8.25,
                reverseColorMap: true,
                collapseClades: true,
            });
            pipeline.execute(empress);
            equal(empress.reset, 1);
            equal(empress.colorCategory, "gimme-category");
            equal(empress.colorMap, "map-name");
            equal(empress.coloringMethod, "some-method");
            equal(empress.lineThickness, 8.25);
            ok(empress.reverse);
            ok(empress.collapsed);
        });
    });
});
