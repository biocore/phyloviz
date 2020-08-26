require([
    "jquery",
    "underscore",
    "Empress",
    "BarplotLayer",
    "UtilitiesForTesting",
], function ($, _, Empress, BarplotLayer, UtilitiesForTesting) {
    module("Barplots", {
        setup: function () {
            this.testData = UtilitiesForTesting.getTestData();
            this.initTestEmpress = function () {
                return new Empress(
                    this.testData.tree,
                    this.testData.biom,
                    this.testData.fmCols,
                    this.testData.tm,
                    this.testData.im,
                    this.testData.canvas
                );
            };
        },
    });

    test("Barplot panel is initialized with one layer", function () {
        var empress = this.initTestEmpress();
        equal(empress._barplotPanel.layers.length, 1);
    });
    test("Layout availability toggling: initialization (default unrooted layout)", function () {
        // The default layout should influence whether the barplot panel's
        // "available" or "unavailable" content is shown. As of writing, the
        // default layout will always be Unrooted.
        var empress = this.initTestEmpress("Unrooted");
        ok(empress._barplotPanel.availContent.classList.contains("hidden"));
        notOk(
            empress._barplotPanel.unavailContent.classList.contains("hidden")
        );
    });
    test("Layout availability toggling post-initialization", function () {
        var empress = this.initTestEmpress("Unrooted");
        // We need to call this in order to make updateLayout() work.
        // Otherwise, things start breaking -- see
        // https://github.com/biocore/empress/pull/320 for context.
        empress.initialize();

        // After updating the layout to something that supports barplots, the
        // barplot "available content" should now be shown.
        empress.updateLayout("Rectangular");
        notOk(empress._barplotPanel.availContent.classList.contains("hidden"));
        ok(empress._barplotPanel.unavailContent.classList.contains("hidden"));

        // ... And going back to a not-compatible-with-barplots layout should
        // switch back to the unavailable content.
        empress.updateLayout("Unrooted");
        ok(empress._barplotPanel.availContent.classList.contains("hidden"));
        notOk(
            empress._barplotPanel.unavailContent.classList.contains("hidden")
        );
    });
    test("Barplot layers default to feature metadata layers, but only if feature metadata is available", function () {
        // (Sample metadata should always be available. (... That is, until we
        // support visualizing a tree without table / sample metadata info.)
        var empressWithFM = this.initTestEmpress();
        equal(empressWithFM._barplotPanel.layers[0].barplotType, "fm");

        var empressWithNoFM = new Empress(
            this.testData.tree,
            this.testData.biom,
            [],
            {},
            {},
            this.testData.canvas
        );
        equal(empressWithNoFM._barplotPanel.layers[0].barplotType, "sm");
    });
    test("BarplotPanelHandler.addLayer", function () {
        var scope = this;
        var empress = this.initTestEmpress();

        // Add on two layers
        empress._barplotPanel.addLayer();
        equal(empress._barplotPanel.layers.length, 2);
        empress._barplotPanel.addLayer();
        equal(empress._barplotPanel.layers.length, 3);

        // Check that each layer was provided correct information
        _.each(empress._barplotPanel.layers, function (layer, i) {
            // Basic information about the visualization -- should be the same
            // across every layer
            equal(layer.fmCols, scope.testData.fmCols);
            equal(layer.smCols, empress._barplotPanel.smCols);
            equal(layer.barplotPanel, empress._barplotPanel);
            equal(layer.layerContainer, empress._barplotPanel.layerContainer);
            // Check that the "num" and "unique num" of each barplot layer were
            // assigned correctly. Since no layers have been removed, these
            // numbers should be identical.
            equal(layer.num, i + 1);
            equal(layer.uniqueNum, i + 1);
            // Check that each layer's header says "Layer N" (N = layer.num)
            equal(layer.headerElement.innerText, "Layer " + (i + 1));
        });
    });
    test("BarplotPanelHandler.removeLayer", function () {
        var empress = this.initTestEmpress();
        empress._barplotPanel.addLayer();
        equal(empress._barplotPanel.layers.length, 2);
        empress._barplotPanel.addLayer();
        equal(empress._barplotPanel.layers.length, 3);

        // Remove the second of the three layers
        empress._barplotPanel.removeLayer(2);
        // Check that now there are only two layers
        equal(empress._barplotPanel.layers.length, 2);
        // Check that layer 1's number stayed the same, while layer 3's number
        // was decremented
        equal(empress._barplotPanel.layers[0].num, 1);
        equal(empress._barplotPanel.layers[1].num, 2);
        // Check that layer 1's header stayed the same, while layer 3's header
        // was decremented along with its number
        equal(
            empress._barplotPanel.layers[0].headerElement.innerText,
            "Layer 1"
        );
        equal(
            empress._barplotPanel.layers[1].headerElement.innerText,
            "Layer 2"
        );
        // Check that the *unique numbers* of each layer remained the same
        // (so that the HTML elements created for each layer will have distinct
        // IDs)
        equal(empress._barplotPanel.layers[0].uniqueNum, 1);
        equal(empress._barplotPanel.layers[1].uniqueNum, 3);

        // Try adding on a new layer. It should be named "Layer 3" (and have a
        // number of 3), but its unique number should be 4 -- since it's the
        // fourth layer created thus far, ignoring all removal operations.
        empress._barplotPanel.addLayer();
        equal(empress._barplotPanel.layers.length, 3);

        // Verify all the layers' numbers / headers / unique numbers correct
        // (Layer 1 and 2 (previously Layer 3) shouldn't have changed, but we
        // might as well verify they don't break when we add a new layer after
        // them.)
        equal(empress._barplotPanel.layers[0].num, 1);
        equal(empress._barplotPanel.layers[1].num, 2);
        equal(empress._barplotPanel.layers[2].num, 3);
        equal(
            empress._barplotPanel.layers[0].headerElement.innerText,
            "Layer 1"
        );
        equal(
            empress._barplotPanel.layers[1].headerElement.innerText,
            "Layer 2"
        );
        equal(
            empress._barplotPanel.layers[2].headerElement.innerText,
            "Layer 3"
        );
        equal(empress._barplotPanel.layers[0].uniqueNum, 1);
        equal(empress._barplotPanel.layers[1].uniqueNum, 3);
        // This is the most important check -- the newest layer should have a
        // distinct unique number.
        equal(empress._barplotPanel.layers[2].uniqueNum, 4);
    });
    test("BarplotLayer initialization: state matches UI", function () {
        var empress = this.initTestEmpress();
        var layer1 = empress._barplotPanel.layers[0];
        // initTestEmpress() passes in feature metadata, so barplots should
        // default to feature metadata
        equal(layer1.barplotType, "fm");
        // Default color (for feature metadata barplots) defaults to red,
        // a.k.a. the first "Classic QIIME Colors" color
        equal(layer1.initialDefaultColorHex, "#ff0000");
        // (this is a hacky way of checking each element of a RGB triple; for
        // some reason QUnit complains when trying to compare arrays)
        equal(layer1.defaultColor[0], 1);
        equal(layer1.defaultColor[1], 0);
        equal(layer1.defaultColor[2], 0);

        // Default length defaults to, well, DEFAULT_LENGTH
        equal(layer1.defaultLength, BarplotLayer.DEFAULT_LENGTH);

        // Check feature metadata coloring defaults. By default, feature
        // metadata coloring isn't used -- a just-created feature metadata
        // barplot doesn't have any color or length encodings.
        notOk(layer1.colorByFM);
        equal(layer1.colorByFMField, empress._barplotPanel.fmCols[0]);
        equal(layer1.colorByFMColorMap, "discrete-coloring-qiime");
        notOk(layer1.colorByFMContinuous);
        ok(layer1.colorByFMColorMapDiscrete);

        // Check feature metadata length-scaling defaults
        notOk(layer1.scaleLengthByFM);
        equal(layer1.scaleLengthByFMField, empress._barplotPanel.fmCols[0]);
        equal(layer1.scaleLengthByFMMin, BarplotLayer.DEFAULT_MIN_LENGTH);
        equal(layer1.scaleLengthByFMMax, BarplotLayer.DEFAULT_MAX_LENGTH);

        // Check sample metadata barplot defaults
        equal(layer1.colorBySMField, empress._barplotPanel.smCols[0]);
        equal(layer1.colorBySMColorMap, "discrete-coloring-qiime");
        equal(layer1.lengthSM, BarplotLayer.DEFAULT_LENGTH);
    });
    // TODO: Test that interacting with various elements of the BarplotLayer UI
    // also changes the BarplotLayer state. Testing this shouldn't really be
    // that difficult, it'll just be kind of tedious.
});