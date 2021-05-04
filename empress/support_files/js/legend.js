define(["jquery", "underscore", "util"], function ($, _, util) {
    /**
     *
     * @class Legend
     *
     * Creates a legend within a given HTML element. (You'll need to call
     * addCategoricalKey(), addContinuousKey(), or addLengthKey() to populate
     * the legend with data.)
     *
     * @param {HTMLElement} container DOM element to which this legend's HTML
     *                                will be added.
     *
     * @return {Legend}
     * @constructs Legend
     */
    function Legend(container) {
        /**
         * @type {HTMLElement}
         * Reference to the element containing the legend.
         * @private
         */
        this._container = container;

        /**
         * @type {String}
         * The "type" of the legend. Will be set when any of the
         * Legend.add*Key() functions is called to be one of "continuous",
         * "categorical", or "length". This will be null instead of a
         * String before any of the add*Key() functions is called and after
         * clear() is called.
         * @public
         */
        this.legendType = null;

        /**
         * @type {String}
         * Contains the current title text for the legend. Will be "" if
         * addTitle() hasn't been called yet / after clear() is called.
         * @public
         */
        this.title = "";

        /**
         * @type {Array}
         * Sorted categories shown in a categorical legend. Stored as a
         * class-level variable so it can be retrieved when exporting a
         * categorical legend to SVG.
         * @private
         */
        this._sortedCategories = [];

        /**
         * @type {Object}
         * Maps categories to hex colors. Same deal as with
         * this._sortedCategories -- we store this in order to make exporting
         * categorical legends easier.
         * @private
         */
        this._category2color = {};

        /**
         * @type {String}
         * Copy of the gradient SVG shown in a continous legend (just the
         * gradient stuff, not the <rect> / <text> stuff -- see the Colorer
         * object for details.) Used for exporting.
         * @private
         */
        this._gradientSVG = "";

        /**
         * @type {String}
         * Refers to the ID of the <linearGradient> used in a gradient for a
         * continuous legend. Helps with referring to this gradient within a
         * new containing element; used for exporting.
         * @private
         */
        this._gradientID = "";

        /**
         * @type {Boolean}
         * Whether or not a warning about missing / non-numeric values in a
         * continuous legend is shown. Used for exporting.
         * @private
         */
        this._missingNonNumericWarningShown = false;

        /**
         * @type {String}
         * Representations of the min, mid (aka (min + max) / 2), and max
         * values used in a (continuous) legend. Used for exporting.
         * @private
         */
        this._minValStr = "";
        this._midValStr = "";
        this._maxValStr = "";

        /**
         * @type {Number}
         * The minimum and maximum value in a length legend. Used for
         * exporting.
         * @private
         */
        this._minLengthVal = null;
        this._maxLengthVal = null;
    }

    /**
     * Adds a title element to the legend container.
     *
     * Also updates this.title to equal the input text.
     *
     * @param {String} name Text to show in the title.
     */
    Legend.prototype.addTitle = function (name) {
        var titleDiv = this._container.appendChild(
            document.createElement("div")
        );
        titleDiv.classList.add("legend-title");
        titleDiv.innerText = name;
        this.title = name;
    };

    /**
     * Un-hides the legend.
     */
    Legend.prototype.unhide = function () {
        // If the container was previously hidden, un-hide it
        this._container.classList.remove("hidden");
    };

    /**
     * Displays a continuous color key.
     *
     * This function takes as input the info defining the gradient SVG
     * to display, so it doesn't do much actual work.
     * (Colorer.assignContinuousScaledColors() does most of the work in
     * computing this information.)
     *
     * The creation of the SVG container was based on Emperor's code:
     * https://github.com/biocore/emperor/blob/00c73f80c9d504826e61ddcc8b2c0b93f344819f/emperor/support_files/js/color-view-controller.js#L54-L56
     *
     * @param {String} name Text to show in the legend title.
     * @param {Object} gradInfo Output of Colorer.getGradientInfo(). Please
     *                          see the docs of that function for details.
     * @param {Boolean} showNonNumericWarning If true, a warning will be shown
     *                                        below the gradient about some
     *                                        values being omitted from the
     *                                        gradient due to being
     *                                        non-numeric.
     */
    Legend.prototype.addContinuousKey = function (name, gradInfo) {
        this.clear();
        this.addTitle(name);

        // Save the gradient info to make life easier when exporting SVG for
        // this legend later on.
        this._gradientSVG = gradInfo.gradientSVG;
        this._gradientID = gradInfo.gradientID;
        this._minValStr = gradInfo.minValStr;
        this._midValStr = gradInfo.midValStr;
        this._maxValStr = gradInfo.maxValStr;
        this._missingNonNumericWarningShown = gradInfo.missingNonNumerics;

        // We only save this to a local variable (not an attribute of the
        // class) since we only use it for the HTML representation of the
        // gradient, not for the SVG-exported representation of the gradient.
        var totalHTMLSVG = this._gradientSVG + gradInfo.pageSVG;

        // Apparently we need to use createElementNS() (not just
        // createElement()) for SVGs. I am not sure why this is the case, but
        // it made the SVG show up (before I added this, nothing was showing up
        // although the SVG worked if I saved it into a HTML document and
        // opened that in a browser). See
        // https://stackoverflow.com/a/17520712/10730311.
        // (According to https://stackoverflow.com/q/27854409/10730311, this
        // should work offline.)
        var containerSVG = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
        );
        containerSVG.setAttribute("width", "100%");
        containerSVG.setAttribute("height", "100%");
        containerSVG.setAttribute("style", "display: block; margin: auto;");
        // just kinda plop the combined SVG code into containerSVG's HTML
        containerSVG.innerHTML = totalHTMLSVG;
        this._container.appendChild(containerSVG);
        if (this._missingNonNumericWarningShown) {
            var warningP = document.createElement("p");
            warningP.innerText = Legend.CONTINUOUS_MISSING_NON_NUMERIC_WARNING;
            warningP.classList.add("side-panel-notes");
            // All legends have white-space: nowrap; set to prevent color
            // labels from breaking onto the next line (which would look
            // funky). However, for this simple warning paragraph, we want it
            // to display like an ordinary paragraph (and have line breaks as
            // necessary to fit within the legend container). Hence why we
            // override the white-space setting for this element.
            warningP.setAttribute("style", "white-space: normal;");
            this._container.appendChild(warningP);
        }
        this.legendType = "continuous";
        this.unhide();
    };

    /**
     * Displays a categorical color key.
     *
     * Each key/value pair in the input color key is displayed in a separate
     * row in the legend. Pairs are sorted from top to bottom in the legend
     * using util.naturalSort() on the keys (this should match the way colors
     * are assigned).
     *
     * NOTE that this will assign values to this._sortedCategories and
     * this._category2color. (The values of these attributes are arbitrary when
     * you call another add*Key() function -- they're intended for internal
     * use within the Legend class.)
     *
     * @param {String} name Text to show in the legend title.
     * @param {Object} info Color key information. This should map unique
     *                      values (e.g. in sample or feature metadata) to
     *                      their assigned color, expressed in hex format.
     */
    Legend.prototype.addCategoricalKey = function (name, info) {
        this.clear();
        this.addTitle(name);
        this._sortedCategories = util.naturalSort(_.keys(info));
        this._category2color = info;
        var containerTable = document.createElement("table");
        // Remove border spacing, which seems to be a default for at least some
        // browsers. This prevents labels from appearing to the left of color
        // categories when scrolling the legend horizontally (it just looks
        // kinda ugly, so by smooshing the colors to the left of the legend we
        // avoid this problem).
        containerTable.setAttribute("style", "border-spacing: 0;");
        _.each(this._sortedCategories, function (key) {
            var newRow = containerTable.insertRow(-1);

            // Add a color box (could totally be replaced by e.g. a Spectrum
            // color picker in the future).
            var colorCell = newRow.insertCell(-1);
            colorCell.classList.add("category-color");
            colorCell.classList.add("frozen-cell");
            colorCell.setAttribute("style", "background: " + info[key] + ";");

            // Add a label for that color box.
            var labelCell = newRow.insertCell(-1);
            // We put the actual label text inside a <label> in the cell, not
            // just in the first layer of the cell. This is needed so that we
            // can have margins on this text: see
            // https://stackoverflow.com/a/26212545/10730311. (Applying
            // .gradient-label to the labelCell directly resulted in the
            // margin-left not being respected, hence this workaround.)
            var innerLabel = labelCell.appendChild(
                document.createElement("label")
            );
            innerLabel.classList.add("gradient-label");
            innerLabel.innerText = key;
            innerLabel.title = key;
        });
        this._container.appendChild(containerTable);
        this.legendType = "categorical";
        this.unhide();
    };

    /**
     * Displays information in the legend about barplot length scaling.
     *
     * This just shows a minimum and maximum value. It's not very fancy yet!
     *
     * @param {String} name Text to show in the legend title.
     * @param {Number} minVal Number to show next to a "Minimum" header.
     *                        This should be the minimum value in the field
     *                        that was used to perform length scaling.
     * @param {Number} maxVal Number to show next to a "Maximum" header.
     *                        This should be the maximum value in the field
     *                        that was used to perform length scaling.
     */
    Legend.prototype.addLengthKey = function (name, minVal, maxVal) {
        this.clear();
        this.addTitle(name);

        this._minLengthVal = minVal;
        this._maxLengthVal = maxVal;

        var infoTable = document.createElement("table");
        var minRow = infoTable.insertRow(-1);
        var minHeaderCell = minRow.insertCell(-1);
        minHeaderCell.innerText = "Minimum";
        minHeaderCell.classList.add("header-cell");
        var minValCell = minRow.insertCell(-1);
        minValCell.innerText = minVal;

        var maxRow = infoTable.insertRow(-1);
        var maxHeaderCell = maxRow.insertCell(-1);
        maxHeaderCell.innerText = "Maximum";
        maxHeaderCell.classList.add("header-cell");
        var maxValCell = maxRow.insertCell(-1);
        maxValCell.innerText = maxVal;

        this._container.append(infoTable);
        this.legendType = "length";
        this.unhide();
    };

    /**
     * Hides, and removes all child HTML elements from, the container.
     *
     * Code to remove all child elements taken from
     * https://developer.mozilla.org/en-US/docs/Web/API/Node/childNodes.
     */
    Legend.prototype.clear = function () {
        this._container.classList.add("hidden");
        $(this._container).empty();
        this.legendType = null;
        this.title = "";
        // We don't *need* to, but we clear a few temporary attributes to
        // avoid keeping them in memory.
        // (All of these are only guaranteed to be meaningful if the legend
        // type is set -- since it is now null, we can clear them freely.)
        //
        // Stuff set for categorical legends
        this._sortedCategories = [];
        this._category2color = {};
        // Stuff set for continuous legends
        this._gradientSVG = "";
        this._gradientID = "";
        this._minValStr = "";
        this._midValStr = "";
        this._maxValStr = "";
        this._missingNonNumericWarningShown = false;
    };

    /**
     * Returns true if the legend is currently being used, false otherwise.
     *
     * This is just a convenience function, to avoid users having to manually
     * check if legendType is null.
     *
     * @return {Boolean}
     */
    Legend.prototype.isActive = function () {
        return !_.isNull(this.legendType);
    };

    /**
     * Returns a String describing the <text /> for a legend title, and the
     * estimated length of this text.
     *
     * @param {Number} topY y-position at which to align the top of this text
     *
     * @return {Object} Contains two entries:
     *                  -text: String centering the title in a legend
     *                  -length: Number describing the estimated length (using
     *                   Legend.SVG_CONTEXT) of the title text
     */
    Legend.prototype._getSVGLegendTitle = function (topY) {
        var titleTextLength = Legend.SVG_CONTEXT.measureText(this.title).width;
        // The x="50%" and text-anchor="middle" center the title over the
        // legend: solution from
        // https://stackoverflow.com/a/31522006/10730311.
        //
        // The thing where we set the y-position to topY plus half the line
        // height is a hack that lets us vertically center this text in the
        // middle of its line.
        var titleText =
            '<text x="50%" y="' +
            (topY + Legend.HALF_LINE_HEIGHT) +
            '" text-anchor="middle" dominant-baseline="middle" class="btext">' +
            this.title +
            "</text>\n";
        return {
            text: titleText,
            length: titleTextLength,
        };
    };

    /**
     * Produces an SVG representation of the current legend.
     *
     * Assumes that the legend type is set to categorical.
     *
     * @param {Number} topY y-position of the top edge of the legend SVG
     *
     * @return {Object} Contains three entries:
     *                  -innerSVG: String describing the legend SVG
     *                  -width: Number Width of the SVG
     *                  -height: Number Height of the SVG
     */
    Legend.prototype._exportSVGCategorical = function (topY) {
        var scope = this;
        var title = this._getSVGLegendTitle(topY);
        var innerSVG = title.text;
        var maxLineWidth = title.length;
        // Go through each of the categories and add a row to the legend
        // SVG. (Since the legend type is categorical,
        // this._sortedCategories and this._category2color must be
        // defined.)
        var currRowTopY = topY + Legend.LINE_HEIGHT;
        _.each(this._sortedCategories, function (cat) {
            var color = scope._category2color[cat];
            maxLineWidth = Math.max(
                maxLineWidth,
                Legend.SVG_CONTEXT.measureText(cat).width
            );
            // Add a square to the left of the label showing the color
            innerSVG +=
                '<rect class="blackborder" x="0" y="' +
                currRowTopY +
                '" width="' +
                Legend.LINE_HEIGHT +
                '" height="' +
                Legend.LINE_HEIGHT +
                '" style="fill:' +
                color +
                ';"/>\n';
            // Add text labelling the category
            innerSVG +=
                '<text dominant-baseline="middle" x="' +
                (Legend.LINE_HEIGHT + Legend.TEXT_PADDING) +
                '" y="' +
                (currRowTopY + Legend.HALF_LINE_HEIGHT) +
                '">' +
                cat +
                "</text>\n";
            currRowTopY += Legend.LINE_HEIGHT;
        });

        // The width of this SVG is the max text width plus (in the likely
        // event that the max text width is from a category line, not from
        // the title line) the width of a color square (line height) plus the
        // padding between a color square's right side and the left side
        // of the text plus the same padding on the right side of the text.
        //
        // NOTE that this will be an overestimate if the max text width comes
        // from the title, and not a category line -- that's fine. It is much
        // better to have the legend be slightly larger than needed, rather
        // than not large enough.
        var width = maxLineWidth + Legend.LINE_HEIGHT + 2 * Legend.TEXT_PADDING;
        // Computing the height taken up is even simpler -- it's just the
        // number of categories in the legend (plus one, for the title)
        // multiplied by the line height.
        var height = (this._sortedCategories.length + 1) * Legend.LINE_HEIGHT;
        return {
            width: width,
            height: height,
            innerSVG: innerSVG,
        };
    };

    /**
     * Produces an SVG representation of the current legend.
     *
     * Assumes that the legend type is set to continuous.
     *
     * @param {Number} topY y-position of the top edge of the legend SVG
     *
     * @return {Object} Contains three entries:
     *                  -innerSVG: String describing the legend SVG
     *                  -width: Number Width of the SVG
     *                  -height: Number Height of the SVG
     */
    Legend.prototype._exportSVGContinuous = function (topY) {
        var title = this._getSVGLegendTitle(topY);
        var innerSVG = title.text;
        var maxLineWidth = title.length;
        // Add linear gradient to SVG
        innerSVG += this._gradientSVG;

        // Define the height of the gradient -- let's say it takes up 10 lines.
        var gradientHeight = 10 * Legend.LINE_HEIGHT;

        // Account for the title
        var gradientTopY = topY + Legend.LINE_HEIGHT;

        // Add a <rect> containing said gradient, which we have the luxury
        // of defining the dimensions of :D
        innerSVG +=
            '<rect x="0" y="' +
            gradientTopY +
            '" width="' +
            Legend.LINE_HEIGHT +
            '" height="' +
            gradientHeight +
            '" fill="url(#' +
            this._gradientID +
            ')" />\n';

        // Add min/mid/max value text along the gradient
        var textLeftX = Legend.LINE_HEIGHT + Legend.TEXT_PADDING;

        // Max value text goes at the top of the gradient
        // (... For now, at least -- see
        // https://github.com/biocore/emperor/issues/782.)
        innerSVG +=
            '<text x="' +
            textLeftX +
            '" y="' +
            gradientTopY +
            '" dominant-baseline="hanging">' +
            this._maxValStr +
            "</text>\n";

        // Mid value text goes halfway through the gradient
        // The way to think about this is that this y-coordinate is the
        // average of two y-coords: the topmost y-coord on the gradient
        // (gradientTopY) and the bottommost y-coord on the gradient
        // (gradientTopY + gradientHeight). Once we average these, we can
        // just set the mid value to this y-coordinate (using
        // dominant-baseline="middle" to vertically align it here).
        var midY = (2 * gradientTopY + gradientHeight) / 2;
        innerSVG +=
            '<text x="' +
            textLeftX +
            '" y="' +
            midY +
            '" dominant-baseline="middle">' +
            this._midValStr +
            "</text>\n";

        // Min value text goes at the bottom of the gradient
        innerSVG +=
            '<text x="' +
            textLeftX +
            '" y="' +
            (gradientTopY + gradientHeight) +
            '" dominant-baseline="baseline">' +
            this._minValStr +
            "</text>\n";

        // Try to increase the maximum text line width -- any of these strings
        // could be the longest within this legend.
        var texts = [this._maxValStr, this._midValStr, this._minValStr];

        // But first, let's add a warning about missing / non-numeric values if
        // needed.
        if (this._missingNonNumericWarningShown) {
            // We use a hanging baseline to add some extra vertical space
            // between the gradient minimum value and the warning text. This
            // seems to look nice.
            innerSVG +=
                '<text x="' +
                Legend.TEXT_PADDING +
                '" y="' +
                (gradientTopY + gradientHeight + Legend.HALF_LINE_HEIGHT) +
                '" dominant-baseline="hanging">' +
                Legend.CONTINUOUS_MISSING_NON_NUMERIC_WARNING_SHORT +
                "</text>\n";
            texts.push(Legend.CONTINUOUS_MISSING_NON_NUMERIC_WARNING_SHORT);
        }
        _.each(texts, function (text) {
            maxLineWidth = Math.max(
                maxLineWidth,
                Legend.SVG_CONTEXT.measureText(text).width
            );
        });

        // Similar to categorical legends: max line width is the max text
        // width plus (in event that max text width is from the min / mid /
        // max value, not from the title or warning line) the width of the
        // gradient rect plus padding on both the left and right sides.
        // (Legend.TEXT_PADDING is already included in textLeftX, so we only
        // need to add it once here.)
        var width = maxLineWidth + textLeftX + Legend.TEXT_PADDING;

        // And the height is just the height of the gradient plus the
        // height of the title line. Let's also add half a line of padding at
        // the bottom of the legend, just to give the gradient and text some
        // breathing room.
        var height = gradientHeight + 1.5 * Legend.LINE_HEIGHT;
        // ...And let's also account for the warning line, if added.
        if (this._missingNonNumericWarningShown) {
            height += Legend.LINE_HEIGHT;
        }

        return {
            width: width,
            height: height,
            innerSVG: innerSVG,
        };
    };

    /**
     * Produces an SVG representation of the current legend.
     *
     * Assumes that the legend type is set to length.
     *
     * @param {Number} topY y-position of the top edge of the legend SVG
     *
     * @return {Object} Contains three entries:
     *                  -innerSVG: String describing the legend SVG
     *                  -width: Number Width of the SVG
     *                  -height: Number Height of the SVG
     */
    Legend.prototype._exportSVGLength = function (topY) {
        var title = this._getSVGLegendTitle(topY);
        var innerSVG = title.text;
        var maxLineWidth = title.length;

        // We're basically simulating a table here, so just adding two
        // rows of text won't cut it.
        // First, figure out which header ("Maximum " or "Minimum ") is
        // longer (it's probably gonna be "Maximum " but may as well be
        // safe for weird fonts), and set this to be the left
        // x-coordinate of the value <text>s.
        var maxHeaderWidth = 0;
        _.each(["Minimum ", "Maximum "], function (headerText) {
            maxHeaderWidth = Math.max(
                maxHeaderWidth,
                Legend.SVG_CONTEXT.measureText(headerText).width
            );
        });

        // Now, figure out which value is longer. Used for updating the
        // max line width.
        var maxValWidth = 0;
        _.each([this._minLengthVal, this._maxLengthVal], function (text) {
            maxValWidth = Math.max(
                maxValWidth,
                Legend.SVG_CONTEXT.measureText(text).width
            );
        });

        // Finally, add the rows in. It's four separate <text> tags to
        // accommodate funky positioning stuff.
        var minimumRowY = topY + Legend.LINE_HEIGHT + Legend.HALF_LINE_HEIGHT;
        innerSVG +=
            '<text class="btext" x="' +
            Legend.TEXT_PADDING +
            '" y="' +
            minimumRowY +
            '" dominant-baseline="middle">Minimum</text>\n"';
        innerSVG +=
            '<text x="' +
            (Legend.TEXT_PADDING + maxHeaderWidth) +
            '" y="' +
            minimumRowY +
            '" dominant-baseline="middle">' +
            this._minLengthVal +
            "</text>\n";

        var maximumRowY = minimumRowY + Legend.LINE_HEIGHT;
        innerSVG +=
            '<text class="btext" x="' +
            Legend.TEXT_PADDING +
            '" y="' +
            maximumRowY +
            '" dominant-baseline="middle">Maximum</text>\n"';
        innerSVG +=
            '<text x="' +
            (Legend.TEXT_PADDING + maxHeaderWidth) +
            '" y="' +
            maximumRowY +
            '" dominant-baseline="middle">' +
            this._maxLengthVal +
            "</text>\n";

        // Max header width, max value width, and left and right padding
        var width = maxHeaderWidth + maxValWidth + 2 * Legend.TEXT_PADDING;
        // Three lines (title, min row, max row)
        var height = 3 * Legend.LINE_HEIGHT;
        return {
            width: width,
            height: height,
            innerSVG: innerSVG,
        };
    };

    /**
     * Gets an SVG representation of the legend, along with some other details.
     *
     * @param {Number} topY The y-position at which the top of the legend
     *                      should be placed. (Legend exporting currently works
     *                      by stacking legends vertically, so the first legend
     *                      to be exported should have topY = 0, the next will
     *                      have topY = (first legend's height + maybe some
     *                      spacing), and so on.)
     *
     * @return {Object} Contains three keys:
     *                  -svg: String containing the legend SVG
     *                  -width: Number describing the width of the legend SVG
     *                  -height: Number describing the height of the legend SVG
     *
     * @throws {Error} If the current legend type does not have SVG export
     *                 supported.
     */
    Legend.prototype.exportSVG = function (topY) {
        var exportFunc;
        if (this.legendType === "categorical") {
            exportFunc = "_exportSVGCategorical";
        } else if (this.legendType === "continuous") {
            exportFunc = "_exportSVGContinuous";
        } else if (this.legendType === "length") {
            exportFunc = "_exportSVGLength";
        } else {
            // As of writing this will only really happen if someone tries to
            // export a legend with an invalid legendType (e.g. null), but it
            // could also happen if we add new legend types in the future and
            // forget to support them here
            throw new Error(
                "Cannot export SVG for a legend of type " + this.legendType
            );
        }
        var exportData = this[exportFunc](topY);
        var width = exportData.width;
        var height = exportData.height;
        var innerSVG = exportData.innerSVG;

        // Build up the output SVG based on everything we have.
        // We need to apply width to this SVG in order to be able to
        // center the legend titles using x="50%" (done up around the start
        // of this function); otherwise, the legend titles are centered
        // relative to the parent SVG (containing *all* legends), which looks
        // bad if multiple legends have different lengths (the smaller legend
        // titles will stick out of the border <rect>).
        var outputSVG = '<svg width="' + width + '">\n' + Legend.SVG_STYLE;

        // Add a white rectangle behind the legend with a black border.
        outputSVG +=
            '<rect class="blackborder" x="0" y="' +
            topY +
            '" width="' +
            width +
            '" height="' +
            height +
            '" style="fill:#ffffff;" />\n"';

        // Finally, add the interior of the legend SVG and close out the tag.
        outputSVG += innerSVG + "</svg>\n";

        return {
            svg: outputSVG,
            width: width,
            height: height,
        };
    };

    // Shown at the bottom of continuous legends in the page when some values
    // in a continuous field can't be represented on a gradient
    Legend.CONTINUOUS_MISSING_NON_NUMERIC_WARNING =
        "Some value(s) in this field were missing and/or not numeric. " +
        "These value(s) have been left out of the gradient, and no bar(s) " +
        "have been drawn for them.";

    // Short version of the above warning, shown for the same legends when
    // exported to SVG
    Legend.CONTINUOUS_MISSING_NON_NUMERIC_WARNING_SHORT =
        "Missing / non-numeric value(s) omitted.";

    // Various SVG attributes stored here since they're used every time the
    // export function is called
    Legend.LINE_HEIGHT = 54;
    Legend.HALF_LINE_HEIGHT = 27;
    Legend.TEXT_PADDING = 10;

    // Font style for the legend title and entries. Should match what
    // Empress uses in its body CSS.
    // The context font apparently needs to be set as just "font", but
    // setting the actual text styles in the SVG that way seems to cause
    // some problems for Inkscape and GIMP's SVG importers (e.g. in
    // Inkscape it overrides the title font-weight, and in GIMP the entire
    // thing is ignored -- the font shows up as some small serif font). So
    // we set the context font and <style> font stuff different ways.
    Legend.SVG_FONTSIZE = "30pt";
    Legend.SVG_FONTFAM = "Arial,Helvetica,sans-serif";
    Legend.SVG_FONT = Legend.SVG_FONTSIZE + " " + Legend.SVG_FONTFAM;

    // Used as a rough estimate about the consumed width by text strings.
    Legend.SVG_CONTEXT = document.createElement("canvas").getContext("2d");
    // Fun fact: if you accidentally include a semicolon at the end of the
    // font then this will break Legend.SVG_CONTEXT.measureText()...
    Legend.SVG_CONTEXT.font = "bold " + Legend.SVG_FONT;

    // Set global styling for the SVG, cutting down a bit on redundant text
    // in the output SVG. (This is based on how the vertex/fragment shader
    // code in drawer.js is constructed as an array of strings.)
    Legend.SVG_STYLE =
        [
            "<style>",
            "text {",
            "font-family: " + Legend.SVG_FONTFAM + ";",
            "font-size: " + Legend.SVG_FONTSIZE + ";",
            "}",
            ".btext { font-weight: bold; }",
            ".blackborder { stroke: #000000; stroke-width: 1; }",
            "</style>",
        ].join("\n") + "\n";

    return Legend;
});
