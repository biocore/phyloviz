require([
    "jquery",
    "chroma",
    "UtilitiesForTesting",
    "Legend",
    "Colorer",
], function ($, chroma, UtilitiesForTesting, Legend, Colorer) {
    $(document).ready(function () {
        module("Legend", {
            // Create and destroy the container HTML element within the test,
            // to avoid having to directly mess around with the test HTML file.
            // (I can't find the exact source, but I read about this on a
            // StackOverflow post somewhere.)
            setup: function () {
                this.containerEle = document.createElement("div");
                this.validateRefSVG = function (obsContainerSVG, expSVG) {
                    equal(obsContainerSVG.tagName, "svg");
                    equal(
                        obsContainerSVG.namespaceURI,
                        "http://www.w3.org/2000/svg"
                    );
                    // When rendering the SVG on the page, the browser replaces
                    // <stop .../> with <stop ...></stop> (and
                    // <rect .../> with <rect ...></rect). I don't know why
                    // this is happening, but so that we can directly compare
                    // the HTML strings we just replace things in the observed
                    // SVG to make them consistent.
                    var obsContainerSVGInnerHTML = obsContainerSVG.innerHTML
                        .split("></stop>")
                        .join("/>")
                        .split("></rect>")
                        .join("/>");
                    equal(obsContainerSVGInnerHTML, expSVG);
                };
                this.validateTitleEle = function (ele, expText) {
                    ok(ele.classList.contains("legend-title"));
                    equal(ele.innerText, expText);
                };
            },
            teardown: function () {
                this.containerEle.remove();
            },
        });
        test("On initialization, clear() isn't called", function () {
            // Check that clear() isn't called on constructing the legend, so
            // preexisting elements remain until addCategoricalKey() /
            // addContinuousKey() is called (there isn't really an important
            // reason for this, it's just how things work; the caller is
            // responsible for making sure Legends aren't created in already-
            // populated containers, at least when initially constructing a
            // Legend)
            var funkyP = this.containerEle.appendChild(
                document.createElement("p")
            );
            funkyP.innerText = "asdfasdfasdf";
            var legend = new Legend(this.containerEle);
            equal(this.containerEle.firstChild, funkyP);
        });
        test('On initialization, legendType is null and title is ""', function () {
            var legend = new Legend(this.containerEle);
            equal(legend.legendType, null);
            equal(legend.title, "");
        });
        test("addCategoricalKey", function () {
            var legend = new Legend(this.containerEle);
            var colorInfo = {
                "Thing 1": "#ff0000",
                "Thing 2": "#00ff00",
                "Thing 3": "#0000ff",
                "Thing 4": "#ffffff",
                "Thing 5": "#000000",
            };
            legend.addCategoricalKey("qwerty", colorInfo);

            // Check that the legend type was set correctly
            equal(legend.legendType, "categorical");

            // There should only be two top-level elements added to the legend
            // container element
            equal(this.containerEle.children.length, 2);

            // The first of these child elements should be a title
            this.validateTitleEle(this.containerEle.children[0], "qwerty");
            equal(legend.title, "qwerty");

            // The second is a table containing the color map
            var tbl = this.containerEle.children[1];
            equal(tbl.tagName, "TABLE");
            // Iterate over every row in the table using jQuery: see
            // https://stackoverflow.com/a/10432012/10730311
            // Note that the order of the parameters of the .each() callback
            // differs from underscore.js' .each() callbacks. To quote
            // Socrates, "sometimes it be like that."
            $(tbl)
                .find("tr")
                .each(function (i, tr) {
                    var cellsInRow = $(tr).children();
                    equal(cellsInRow.length, 2);

                    // First off, check that the colors are as expected.

                    // The color returned by jQuery is formatted something like
                    // "rgb(255, 0, 0)". Fortunately, chroma.js recognizes this, so
                    // we can just chuck both colors to compare through chroma
                    // before checking equality.
                    // Note: firefox breaks on this test. chroma.js does not
                    // recognize "rgb(255, 0, 0" on firefox. This is not an
                    // issue for empress as we would not pass "rgb(r, g, b)" to
                    // chroma.js
                    var shownColor = $(cellsInRow[0]).css("background");
                    // key -> color mappings should be sorted based on the key
                    // using util.naturalSort(). So we can assume that Thing 1 is
                    // the first row, Thing 2 is the second row, etc.
                    var expectedKey = "Thing " + (i + 1);
                    equal(
                        chroma(shownColor).hex(),
                        chroma(colorInfo[expectedKey]).hex()
                    );

                    // Now, check that the legend is as expected.
                    equal(cellsInRow[1].innerText, expectedKey);
                });
            // Legend should be visible
            notOk(this.containerEle.classList.contains("hidden"));

            // Check that _sortedCategories and _category2color are defined
            deepEqual(legend._sortedCategories, [
                "Thing 1",
                "Thing 2",
                "Thing 3",
                "Thing 4",
                "Thing 5",
            ]);
            deepEqual(legend._category2color, colorInfo);
        });
        test("addCategoricalKey (just 1 color)", function () {
            var legend = new Legend(this.containerEle);
            var darkBrown = "#52330b";
            var colorInfo = { hjkl: darkBrown };
            legend.addCategoricalKey("Single-color test", colorInfo);

            equal(legend.legendType, "categorical");

            var title = this.containerEle.children[0];
            equal(title.innerText, "Single-color test");
            equal(legend.title, "Single-color test");

            var tbl = this.containerEle.children[1];
            var rows = $(tbl).find("tr");
            equal(rows.length, 1);
            var cells = $(rows[0]).children();
            equal(chroma($(cells[0]).css("background")).hex(), darkBrown);
            equal(cells[1].innerText, "hjkl");

            // Check that _sortedCategories and _category2color are defined
            deepEqual(legend._sortedCategories, ["hjkl"]);
            deepEqual(legend._category2color, colorInfo);
        });
        test("addContinuousKey", function () {
            var legend = new Legend(this.containerEle);
            var colorer = new Colorer("Viridis", ["0", "4"], true);
            var refSVGs = UtilitiesForTesting.getReferenceSVGs();
            legend.addContinuousKey(
                "OMG this is a continuous legend!",
                colorer.getGradientInfo()
            );

            equal(legend.legendType, "continuous");

            // As with addCategoricalKey(), there are two children added to the
            // top level of the container element.
            equal(this.containerEle.children.length, 2);

            // 1. A title
            this.validateTitleEle(
                this.containerEle.children[0],
                "OMG this is a continuous legend!"
            );
            equal(legend.title, "OMG this is a continuous legend!");

            // 2. A "container SVG" element containing the gradient SVG and
            // <rect>/<text> stuff positioning this gradient
            // (these are split into separate SVGs in the test data, but we can
            // just concatenate these strings together to get the expected SVG
            // here)
            var cSVG = this.containerEle.children[1];
            this.validateRefSVG(cSVG, refSVGs[0] + refSVGs[1]);

            // Legend should be visible
            notOk(this.containerEle.classList.contains("hidden"));

            // Check SVG exporting attributes are set ok
            ok(legend._gradientSVG.includes("<linearGradient"));
            equal(legend._gradientID, "Gradient0");
            equal(legend._minValStr, "0");
            equal(legend._midValStr, "2");
            equal(legend._maxValStr, "4");
            notOk(legend._missingNonNumericWarningShown);
        });
        test("addContinuousKey (with non-numeric warning)", function () {
            var legend = new Legend(this.containerEle);
            var colorer = new Colorer("Viridis", ["0", ">:D", "4"], true);
            var refSVGs = UtilitiesForTesting.getReferenceSVGs();
            legend.addContinuousKey("howdy", colorer.getGradientInfo());

            equal(legend.legendType, "continuous");

            // There's a third top-level child element now -- a warning
            // message shown to the user.
            equal(this.containerEle.children.length, 3);

            // 1. Check title
            this.validateTitleEle(this.containerEle.children[0], "howdy");
            equal(legend.title, "howdy");

            // 2. Check SVG
            var cSVG = this.containerEle.children[1];
            this.validateRefSVG(cSVG, refSVGs[0] + refSVGs[1]);

            // 3. Check non-numeric warning
            var warning = this.containerEle.children[2];
            equal(warning.tagName, "P");
            equal(
                warning.innerText,
                Legend.CONTINUOUS_MISSING_NON_NUMERIC_WARNING
            );
            // Verify that the warning <p> has white-space: normal; set so it
            // has line breaks, like normal text
            equal($(warning).css("white-space"), "normal");

            // Legend should be visible
            notOk(this.containerEle.classList.contains("hidden"));

            // Check that legend._gradientSVG and
            // legend._nonNumericWarningShown are properly set
            // (The gradientSVG check is extremely cursory -- this just
            // verifies that it kinda looks like a gradient. The actual
            // gradient SVG being correct is tested in test-colorer.js.)
            ok(legend._gradientSVG.includes("<linearGradient"));
            equal(legend._gradientID, "Gradient0");
            equal(legend._minValStr, "0");
            equal(legend._midValStr, "2");
            equal(legend._maxValStr, "4");
            ok(legend._missingNonNumericWarningShown);
        });
        test("addLengthKey", function () {
            var legend = new Legend(this.containerEle);
            legend.addLengthKey("LengthTest :O", -5.12345, 1000);

            equal(legend.legendType, "length");

            equal(legend.title, "LengthTest :O");
            var title = this.containerEle.children[0];
            equal(title.innerText, "LengthTest :O");

            // The table created by this function should just have two rows,
            // one for the min and one for the max val
            var tbl = this.containerEle.children[1];
            var rows = $(tbl).find("tr");
            equal(rows.length, 2);

            var row1cells = $(rows[0]).children();
            equal(row1cells[0].innerText, "Minimum");
            ok(row1cells[0].classList.contains("header-cell"));
            equal(row1cells[1].innerText, "-5.12345");

            var row2cells = $(rows[1]).children();
            equal(row2cells[0].innerText, "Maximum");
            ok(row2cells[0].classList.contains("header-cell"));
            equal(row2cells[1].innerText, "1000");

            // Legend should be visible
            notOk(this.containerEle.classList.contains("hidden"));
        });
        test("clear", function () {
            var legend = new Legend(this.containerEle);
            var funkyP = this.containerEle.appendChild(
                document.createElement("p")
            );
            funkyP.innerText = "I should be removed when clear is called!";
            var wackyDiv = this.containerEle.appendChild(
                document.createElement("div")
            );
            wackyDiv.innerText =
                "I'm here to test that clear removes all children";
            legend.legendType =
                "I'm here to test that legendType is reset on clearing";
            legend.title = "I'm here to test that title is reset on clearing";
            legend.clear();
            // The legend container should now be hidden
            ok(this.containerEle.classList.contains("hidden"));
            // ... and all of its child elements should be removed
            equal(this.containerEle.firstChild, null);
            // ... and the legendType should be null
            equal(legend.legendType, null);
            // ... and the title should be ""
            equal(legend.title, "");
        });
        test("unhide", function () {
            var legend = new Legend(this.containerEle);
            legend.clear();
            // Legend container is now hidden
            ok(this.containerEle.classList.contains("hidden"));
            legend.unhide();
            // Legend container is now not hidden!
            notOk(this.containerEle.classList.contains("hidden"));
        });
        test("addTitle", function () {
            var legend = new Legend(this.containerEle);
            var titleText1 = "Hi I'm a title";
            legend.addTitle(titleText1);
            equal(this.containerEle.children.length, 1);
            this.validateTitleEle(this.containerEle.children[0], titleText1);
            equal(legend.title, titleText1);

            // Note that addTitle() sets the text using innerText, so HTML in
            // the text should be treated as just part of the string
            var titleText2 =
                "Two titles? In my <div></div>? It's more " +
                "likely than you think.";
            legend.addTitle(titleText2);
            equal(this.containerEle.children.length, 2);
            this.validateTitleEle(this.containerEle.children[1], titleText2);
            equal(legend.title, titleText2);
        });
    });
});
