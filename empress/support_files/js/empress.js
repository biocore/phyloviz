define([
    "underscore",
    "Camera",
    "Drawer",
    "Colorer",
    "VectorOps",
    "CanvasEvents",
    "BarplotPanel",
    "Legend",
    "util",
    "chroma",
    "LayoutsUtil",
    "ExportUtil",
    "TreeController",
], function (
    _,
    Camera,
    Drawer,
    Colorer,
    VectorOps,
    CanvasEvents,
    BarplotPanel,
    Legend,
    util,
    chroma,
    LayoutsUtil,
    ExportUtil,
    TreeController
) {
    /**
     * @class EmpressTree
     *
     * @param {BPTree} tree The phylogenetic tree.
     * @param {BIOMTable or null} biom The BIOM table used to color the tree.
     *                                 If no table / sample metadata was passed
     *                                 to Empress (i.e. using qiime empress
     *                                 tree-plot), this should be null.
     * @param {Array} featureMetadataColumns Columns of the feature metadata.
     *                Note: The order of this array should match the order of
     *                      the arrays which are the values of tipMetadata and
     *                      intMetadata. If no feature metadata was provided
     *                      when generating an Empress visualization, this
     *                      parameter should be [] (and tipMetadata and
     *                      intMetadata should be {}s).
     * @param {Array} splitTaxonomyColumns Columns of the feature metadata
     *                                     corresponding to explicitly
     *                                     specified levels of a taxonomy, if
     *                                     available. Should be [] if not
     *                                     applicable. Every value in this
     *                                     Array must also be present in
     *                                     featureMetadataColumns.
     * @param {Object} tipMetadata Feature metadata for tips in the tree.
     *                 Note: This should map tip names to an array of feature
     *                       metadata values. Each array should have the same
     *                       length as featureMetadataColumns.
     * @param {Object} intMetadata Feature metadata for internal nodes in tree.
     *                 Note: Should be formatted analogously to tipMetadata.
     *                       Note that internal node names can be non-unique.
     * @param {Canvas} canvas The HTML canvas that the tree will be drawn on.
     */
    function Empress(
        tree,
        biom,
        featureMetadataColumns,
        splitTaxonomyColumns,
        tipMetadata,
        intMetadata,
        canvas
    ) {
        /**
         * @type {Camera}
         * The camera used to look at the tree
         * @private
         */
        this._cam = new Camera();

        /**
         * @type {Drawer}
         * used to draw the tree
         * @private
         */
        // allow canvas to be null to make testing empress easier
        if (canvas !== null) {
            this._drawer = new Drawer(canvas, this._cam);
            this._canvas = canvas;
        }

        /**
         * @type {Array}
         * The default color of the tree
         */
        this.DEFAULT_COLOR = Colorer.rgbToFloat([64, 64, 64]);

        /**
         * @type {BPTree}
         * The phylogenetic balance parenthesis tree
         * @private
         */
        this._tree = new TreeController(tree);

        /**
         * Used to index into _treeData
         * @type {Object}
         * @private
         */
        this._tdToInd = {
            // all nodes (non-layout parameters)
            color: 0,
            isColored: 1,
            visible: 2,
            // unrooted layout
            x2: 3,
            y2: 4,
            // rectangular layout
            xr: 3,
            yr: 4,
            highestchildyr: 5,
            lowestchildyr: 6,
            // circular layout
            xc0: 3,
            yc0: 4,
            xc1: 5,
            yc1: 6,
            angle: 7,
            arcx0: 8,
            arcy0: 9,
            arcstartangle: 10,
            arcendangle: 11,
        };

        /**
         * The number of non layout parameters in _treeData.
         * @type {Number}
         * @private
         */
        this._numOfNonLayoutParams = 3;

        /**
         * @type {Array}
         * The metadata associated with the tree branches
         * Note: postorder positions are used as indices because internal node
         *       names are not assumed to be unique.
         * @private
         */
        this._treeData = new Array(this._tree.size + 1);

        // set default color/visible status for each node
        // Note: currently empress tree uses 1-based index since the bp-tree
        //       bp-tree.js is based off of used 1-based index.
        for (var i = 1; i <= this._tree.size; i++) {
            this._treeData[i] = new Array(this._tdToInd.length);
            this._treeData[i].splice(
                this._tdToInd.color,
                0,
                this.DEFAULT_COLOR
            );
            this._treeData[i].splice(this._tdToInd.isColored, 0, false);
            this._treeData[i].splice(this._tdToInd.visible, 0, true);
        }

        /**
         * @type {Legend}
         * Legend describing the way the tree is colored.
         * @private
         */
        this._legend = new Legend(document.getElementById("legend-main"));

        /**
         * @type {BiomTable}
         * BIOM table: includes feature presence information and sample-level
         * metadata. Can be null if no table / sample metadata was passed to
         * Empress.
         * @private
         */
        this._biom = biom;

        this.isCommunityPlot = !_.isNull(this._biom);

        /**
         * @type {Array}
         * Feature metadata column names.
         * @private
         */
        this._featureMetadataColumns = featureMetadataColumns;

        /**
         * @type {Array}
         * Taxonomy column names. Should be handled specially when coloring
         * by these, or using them in feature metadata barplots -- see
         * https://github.com/biocore/empress/issues/473 and
         * https://github.com/biocore/empress/pull/482 for details/discussion.
         * @private
         */
        this._splitTaxonomyColumns = splitTaxonomyColumns;

        /**
         * @type{Object}
         * Feature metadata: keys are tree node names, and values are arrays
         * of length equal to this._featureMetadataColumns.length.
         * For the sake of simplicity, we split this up into tip and internal
         * node feature metadata objects.
         * @private
         */
        this._tipMetadata = tipMetadata;
        this._intMetadata = intMetadata;

        /**
         * @type{Object}
         * As described above, maps layout names to node coordinate suffixes
         * in the tree data.
         * @private
         */
        this._layoutToCoordSuffix = {
            Rectangular: "r",
            Circular: "c1",
            Unrooted: "2",
        };

        /**
         * @type {String}
         * The default / current layouts used in the tree visualization.
         * @private
         */
        this._defaultLayout = "Unrooted";
        this._currentLayout = "Unrooted";

        /**
         * @type {BarplotPanel}
         * Manages a collection of BarplotLayers, as well as the state of the
         * barplot panel. Also can call Empress.drawBarplots() /
         * Empress.undrawBarplots() when needed. Can be null if no feature or
         * sample metadata was passed to Empress.
         * @private
         */
        this._barplotPanel = null;
        if (this.isCommunityPlot || this._featureMetadataColumns.length > 0) {
            this._barplotPanel = new BarplotPanel(this, this._defaultLayout);
        }

        /**
         * @type {Number}
         * The y scaling factor for the rectangular layout. This is used to
         * adjust the thickness of barplot bars.
         * @private
         */
        this._yrscf = null;

        /**
         * @type {Number}
         * For the rectangular layout, this is the rightmost x-coordinate;
         * for the circular layout, this is the maximum distance from the
         * root of the tree (a.k.a. the maximum radius in polar coordinates).
         * For layouts which do not support barplots (e.g. the unrooted
         * layout), the value of this is arbitrary. Used for determining the
         * "closest-to-the-root" point at which we can start drawing barplots.
         * @private
         */
        this._maxDisplacement = null;

        /**
         * @type {Number}
         * A multiple of this._maxDisplacement. This is used as the unit for
         * barplot lengths.
         * @private
         */
        this._barplotUnit = null;

        /**
         * @type{Boolean}
         * Indicates whether or not barplots are currently drawn.
         * @private
         */
        this._barplotsDrawn = false;

        /**
         * @type{Number}
         * The (not-yet-scaled) line width used for drawing "thick" lines.
         * Can be passed as input to this.thickenColoredNodes().
         */
        this._currentLineWidth = 0;

        /**
         * @type{Bool}
         * Whether or not to draw node circles.
         * Values will range between 0 and 2.
         * 0 - Show only internal node circles
         * 1 - Show all node circles
         * 2 - Do not show node circles
         * 3 - show nodes with only 1 descendant
         */
        this.drawNodeCircles = 3;

        /**
         * @type{Bool}
         * Whether the camera is focused on a selected node.
         */
        this.focusOnSelectedNode = true;

        /**
         * @type{Bool}
         * Whether unrepresented tips are ignored when propagating colors.
         */
        this.ignoreAbsentTips = true;

        /**
         * @type{Bool}
         * Whether to ignore node lengths during layout or not
         */
        this.ignoreLengths = false;

        /**
         * @type{String}
         * Branch length method: one of "normal", "ignore", or "ultrametric"
         */
        this.branchMethod = "normal";

        /**
         * @type{String}
         * Leaf sorting method: one of "none", "ascending", or "descending"
         */
        this.leafSorting = "descending";

        /**
         * @type{CanvasEvents}
         * Handles user events
         */
        // allow canvas to be null to make testing empress easier
        if (
            canvas !== null &&
            document.getElementById("quick-search") !== null
        ) {
            this._events = new CanvasEvents(this, this._drawer, canvas);
        }

        /**
         * @type{Object}
         * @private
         * Stores the information about the collapsed clades. This object is
         * used to determine if a user clicked on a collapsed clade.
         *
         * Note: <node_key> refers to the key in _treeData
         * Format:
         * {
         *      <node_key>: {
         *          left: <node_key>,
         *          right: <node_key>,
         *          deepest: <node_key>,
         *          length: <Number>,
         *          color: <Number>
         *      }
         *  }
         */
        this._collapsedClades = {};

        /**
         * @type(Set)
         * @private
         * Clades that should will not be collapse. Currently, clades are only
         * cleared from this set when resetTree() is called.
         */
        this._dontCollapse = new Set();

        /**
         * @type{Array}
         * @private
         *
         * Stores the vertex information that is passed to WebGL
         *
         * Format: [x, y, RGB, ...]
         */
        this._collapsedCladeBuffer = [];

        /**
         * @type{String}
         * @private
         *
         * The method used to collapsed the tree
         */
        this._collapseMethod = "normal";

        /**
         * @type{Array}
         * @private
         *
         * This stores the group membership of a node. -1 means the node doesn't
         * belong to a group. This array is used to collapse clades by search
         * for clades in this array that share the same group membership.
         */
        this._group = new Array(this._tree.size + 1).fill(-1);
    }

    /**
     * Computes the current tree layout and fills _treeData.
     *
     * Also updates this._maxDisplacement.
     */
    Empress.prototype.getLayoutInfo = function () {
        var data,
            i,
            j = 1;
        // set up length getter
        var branchMethod = this.branchMethod;
        var checkLengthsChange = LayoutsUtil.shouldCheckBranchLengthsChanged(
            branchMethod
        );
        var lengthGetter = LayoutsUtil.getLengthMethod(
            branchMethod,
            this._tree.getTree()
        );
        var dataForOnlyRoot = function (coordKeys) {
            var rootCoordData = {};
            _.each(coordKeys, function (key) {
                rootCoordData[key] = [null, 0];
            });
            return rootCoordData;
        };
        // Rectangular
        if (this._currentLayout === "Rectangular") {
            // tree is just root
            if (this._tree.currentSize == 1) {
                data = dataForOnlyRoot([
                    "xCoord",
                    "yCoord",
                    "highestChildYr",
                    "lowestChildYr",
                    "yScalingFactor",
                ]);
            } else {
                data = LayoutsUtil.rectangularLayout(
                    this._tree.getTree(),
                    4020,
                    4020,
                    // since lengths for "ignoreLengths" are set by `lengthGetter`,
                    // we don't need (and should likely deprecate) the ignoreLengths
                    // option for the Layout functions since the layout function only
                    // needs to know lengths in order to layout a tree, it doesn't
                    // really need encapsulate all of the logic for determining
                    // what lengths it should lay out.
                    this.leafSorting,
                    undefined,
                    lengthGetter,
                    checkLengthsChange
                );
            }
            this._yrscf = data.yScalingFactor;
            for (i of this._tree.postorderTraversal((includeRoot = true))) {
                // remove old layout information
                this._treeData[i].length = this._numOfNonLayoutParams;

                // store new layout information
                this._treeData[i][this._tdToInd.xr] = data.xCoord[j];
                this._treeData[i][this._tdToInd.yr] = data.yCoord[j];
                this._treeData[i][this._tdToInd.highestchildyr] =
                    data.highestChildYr[j];
                this._treeData[i][this._tdToInd.lowestchildyr] =
                    data.lowestChildYr[j];
                j += 1;
            }
        } else if (this._currentLayout === "Circular") {
            if (this._tree.currentSize == 1) {
                data = dataForOnlyRoot([
                    "x0",
                    "y0",
                    "x1",
                    "y1",
                    "angle",
                    "arcx0",
                    "arcy0",
                    "arcStartAngle",
                    "arcEndAngle",
                ]);
            } else {
                data = LayoutsUtil.circularLayout(
                    this._tree.getTree(),
                    4020,
                    4020,
                    this.leafSorting,
                    undefined,
                    lengthGetter,
                    checkLengthsChange
                );
            }
            for (i of this._tree.postorderTraversal((includeRoot = true))) {
                // remove old layout information
                this._treeData[i].length = this._numOfNonLayoutParams;

                // store new layout information
                this._treeData[i][this._tdToInd.xc0] = data.x0[j];
                this._treeData[i][this._tdToInd.yc0] = data.y0[j];
                this._treeData[i][this._tdToInd.xc1] = data.x1[j];
                this._treeData[i][this._tdToInd.yc1] = data.y1[j];
                this._treeData[i][this._tdToInd.angle] = data.angle[j];
                this._treeData[i][this._tdToInd.arcx0] = data.arcx0[j];
                this._treeData[i][this._tdToInd.arcy0] = data.arcy0[j];
                this._treeData[i][this._tdToInd.arcstartangle] =
                    data.arcStartAngle[j];
                this._treeData[i][this._tdToInd.arcendangle] =
                    data.arcEndAngle[j];
                j += 1;
            }
        } else {
            if (this._tree.currentSize == 1) {
                data = dataForOnlyRoot(["xCoord", "yCoord"]);
            } else {
                data = LayoutsUtil.unrootedLayout(
                    this._tree.getTree(),
                    4020,
                    4020,
                    undefined,
                    lengthGetter,
                    checkLengthsChange
                );
            }
            for (i of this._tree.postorderTraversal((includeRoot = true))) {
                // remove old layout information
                this._treeData[i].length = this._numOfNonLayoutParams;

                // store new layout information
                this._treeData[i][this._tdToInd.x2] = data.xCoord[j];
                this._treeData[i][this._tdToInd.y2] = data.yCoord[j];
                j += 1;
            }
        }
        this._drawer.loadTreeCoordsBuff(this.getTreeCoords());
        this._computeMaxDisplacement();
    };

    /**
     * Initializes WebGL and then draws the tree
     */
    Empress.prototype.initialize = function () {
        this._drawer.initialize();
        this._events.setMouseEvents();
        this.setAutoCompleteNames();

        this.getLayoutInfo();
        this.centerLayoutAvgPoint();
    };

    /**
     * Retrieve an attribute from a node.
     *
     * @param{Number} node Postorder position of node.
     * @param{String} attr The attribute to retrieve from the node.
     *
     * @return The attribute; if attr is not a valid attribute of node, then
     *         undefined will be returned.
     */
    Empress.prototype.getNodeInfo = function (node, attr) {
        if (attr === "name") {
            return this._tree.name(this._tree.postorderselect(node));
        }
        return this._treeData[node][this._tdToInd[attr]];
    };

    /**
     * Sets an attribute of a node.
     *
     * Note: this method does not perfom any kind of validation. It is assumed
     *       that node, attr and value are all valid.
     *
     * @param{Integer} node post-order position of node..
     * @param{String} attr The attribute to set for the node.
     * @param{Object} value The value to set for the given attribute for the
     *                      node.
     */
    Empress.prototype.setNodeInfo = function (node, attr, value) {
        this._treeData[node][this._tdToInd[attr]] = value;
    };

    /**
     * Draws the tree
     */
    Empress.prototype.drawTree = function () {
        this._drawer.loadTreeColorBuff(this.getTreeColor());
        this._drawer.loadNodeBuff(this.getNodeCoords());
        this._drawer.loadCladeBuff(this._collapsedCladeBuffer);
        this._drawer.draw();
    };

    /**
     * Exports a SVG image of the active legends.
     *
     * Currently this just includes the legend used for tree coloring, but
     * eventually this'll be expanded to include all the barplot legends as
     * well.
     *
     * @return {String} svg
     */
    Empress.prototype.exportLegendSVG = function () {
        var legends = [];
        // Add the legend used for coloring the tree (if shown).
        if (this._legend.isActive()) {
            legends.push(this._legend);
        }
        // Add all the active legends from all the barplot layers.
        // NOTE: Since we expect there to be many more barplot legends than
        // just the one tree-coloring legend, we could potentially save a tiny
        // bit of time by just setting legends to the output of getLegends()
        // and then calling unshift() to add this._legend to the start of the
        // array. However, I don't think the speed gain would be worth making
        // this code much less readable ._.
        if (this._barplotsDrawn) {
            legends.push(...this._barplotPanel.getLegends());
        }
        if (legends.length === 0) {
            util.toastMsg("No active legends to export.", 5000);
            return null;
        } else {
            return ExportUtil.exportLegendSVG(legends);
        }
    };

    /**
     * Retrieves the coordinate info of the tree.
     *
     * We used to interlace the coordinate information with the color information
     * i.e. [x1, y1, red1, green1, blue1, x2, y2, red2, green2, blue2,...]
     * This was inefficient because tree coordinates do not change during most
     * update operations (such as feature coloring). Thus, we split the
     * coordinate information into two seperate buffers. One for tree
     * tree coordinates and another for color.
     *
     * @return {Array}
     */
    Empress.prototype.getTreeCoords = function () {
        var tree = this._tree;
        var coords = [];

        var addPoint = function (x, y) {
            coords.push(x, y);
        };

        /* Draw a vertical line, if we're in rectangular layout mode. Note that
         * we *don't* draw a horizontal line (with the branch length of the
         * root) for the root node, even if it has a nonzero branch length;
         * this could be modified in the future if desired. See #141 on GitHub.
         *
         * (The python code explicitly disallows trees with <= 1 nodes, so
         * we're never going to be in the unfortunate situation of having the
         * root be the ONLY node in the tree. So this behavior is ok.)
         */
        if (this._currentLayout === "Rectangular") {
            addPoint(
                this.getX(tree.size),
                this.getNodeInfo(tree.size, "lowestchildyr")
            );
            addPoint(
                this.getX(tree.size),
                this.getNodeInfo(tree.size, "highestchildyr")
            );
        }
        // iterate through the tree in postorder, skip root
        for (var node of this._tree.postorderTraversal()) {
            // name of current node
            // var node = this._treeData[node];
            var parent = tree.postorder(
                tree.parent(tree.postorderselect(node))
            );
            // parent = this._treeData[parent];

            if (!this.getNodeInfo(node, "visible")) {
                continue;
            }

            if (this._currentLayout === "Rectangular") {
                /* Nodes in the rectangular layout can have up to two "parts":
                 * a horizontal line, and a vertical line at the end of this
                 * line. These parts are indicated below as AAA... and BBB...,
                 * respectively. (Child nodes are indicated by CCC...)
                 *
                 *        BCCCCCCCCCCCC
                 *        B
                 * AAAAAAAB
                 *        B
                 *        BCCCCCCCCCCCC
                 *
                 * All nodes except for the root are drawn with a horizontal
                 * line, and all nodes except for tips are drawn with a
                 * vertical line.
                 */
                // 1. Draw horizontal line (we're already skipping the root)
                addPoint(this.getX(parent), this.getY(node));
                addPoint(this.getX(node), this.getY(node));
                // 2. Draw vertical line, if this is an internal node
                if (this.getNodeInfo(node, "lowestchildyr") !== undefined) {
                    // skip if node is root of collapsed clade
                    if (this._collapsedClades.hasOwnProperty(node)) continue;
                    addPoint(
                        this.getX(node),
                        this.getNodeInfo(node, "highestchildyr")
                    );
                    addPoint(
                        this.getX(node),
                        this.getNodeInfo(node, "lowestchildyr")
                    );
                }
            } else if (this._currentLayout === "Circular") {
                /* Same deal as above, except instead of a "vertical line" this
                 * time we draw an "arc".
                 */
                // 1. Draw line protruding from parent (we're already skipping
                // the root so this is ok)
                //
                // Note that position info for this is stored as two sets of
                // coordinates: (xc0, yc0) for start point, (xc1, yc1) for end
                // point. The *c1 coordinates are explicitly associated with
                // the circular layout so we can just use this.getX() /
                // this.getY() for these coordinates.
                addPoint(
                    this.getNodeInfo(node, "xc0"),
                    this.getNodeInfo(node, "yc0")
                );
                addPoint(this.getX(node), this.getY(node));
                // 2. Draw arc, if this is an internal node (note again that
                // we're skipping the root)
                if (
                    !this._tree.isleaf(this._tree.postorderselect(node)) &&
                    !this._collapsedClades.hasOwnProperty(node)
                ) {
                    // An arc will be created for all internal nodes.
                    // arcs are created by sampling up to 60 small lines along
                    // the arc spanned by rotating the line (arcx0, arcy0)
                    // arcendangle - arcstartangle radians. This will create an
                    // arc that starts at each internal node's rightmost child
                    // and ends on the leftmost child.
                    var arcDeltaAngle =
                        this.getNodeInfo(node, "arcendangle") -
                        this.getNodeInfo(node, "arcstartangle");
                    var numSamples = this._numSampToApproximate(arcDeltaAngle);
                    var sampleAngle = arcDeltaAngle / numSamples;
                    var sX = this.getNodeInfo(node, "arcx0");
                    var sY = this.getNodeInfo(node, "arcy0");
                    for (var line = 0; line < numSamples; line++) {
                        var x =
                            sX * Math.cos(line * sampleAngle) -
                            sY * Math.sin(line * sampleAngle);
                        var y =
                            sX * Math.sin(line * sampleAngle) +
                            sY * Math.cos(line * sampleAngle);
                        addPoint(x, y);

                        x =
                            sX * Math.cos((line + 1) * sampleAngle) -
                            sY * Math.sin((line + 1) * sampleAngle);
                        y =
                            sX * Math.sin((line + 1) * sampleAngle) +
                            sY * Math.cos((line + 1) * sampleAngle);
                        addPoint(x, y);
                    }
                }
            } else {
                addPoint(this.getX(parent), this.getY(parent));
                addPoint(this.getX(node), this.getY(node));
            }
        }
        return new Float32Array(coords);
    };

    Empress.prototype.getTreeColor = function () {
        var tree = this._tree;

        var coords = [];
        var color;
        var addPoint = function () {
            coords.push(color, color);
        };

        /* Draw a vertical line, if we're in rectangular layout mode. Note that
         * we *don't* draw a horizontal line (with the branch length of the
         * root) for the root node, even if it has a nonzero branch length;
         * this could be modified in the future if desired. See #141 on GitHub.
         *
         * (The python code explicitly disallows trees with <= 1 nodes, so
         * we're never going to be in the unfortunate situation of having the
         * root be the ONLY node in the tree. So this behavior is ok.)
         */
        if (this._currentLayout === "Rectangular") {
            color = this.getNodeInfo(tree.size, "color");
            addPoint();
        }
        // iterate through the tree in postorder, skip root
        for (var node of this._tree.postorderTraversal()) {
            if (!this.getNodeInfo(node, "visible")) {
                continue;
            }

            // branch color
            color = this.getNodeInfo(node, "color");

            if (this._currentLayout === "Rectangular") {
                /* Nodes in the rectangular layout can have up to two "parts":
                 * a horizontal line, and a vertical line at the end of this
                 * line. These parts are indicated below as AAA... and BBB...,
                 * respectively. (Child nodes are indicated by CCC...)
                 *
                 *        BCCCCCCCCCCCC
                 *        B
                 * AAAAAAAB
                 *        B
                 *        BCCCCCCCCCCCC
                 *
                 * All nodes except for the root are drawn with a horizontal
                 * line, and all nodes except for tips are drawn with a
                 * vertical line.
                 */
                // 1. Draw horizontal line (we're already skipping the root)
                addPoint();
                // 2. Draw vertical line, if this is an internal node
                if (this.getNodeInfo(node, "lowestchildyr") !== undefined) {
                    // skip if node is root of collapsed clade
                    if (this._collapsedClades.hasOwnProperty(node)) continue;
                    addPoint();
                }
            } else if (this._currentLayout === "Circular") {
                /* Same deal as above, except instead of a "vertical line" this
                 * time we draw an "arc".
                 */
                // 1. Draw line protruding from parent (we're already skipping
                // the root so this is ok)
                //
                // Note that position info for this is stored as two sets of
                // coordinates: (xc0, yc0) for start point, (xc1, yc1) for end
                // point. The *c1 coordinates are explicitly associated with
                // the circular layout so we can just use this.getX() /
                // this.getY() for these coordinates.
                addPoint();
                // 2. Draw arc, if this is an internal node (note again that
                // we're skipping the root)
                if (
                    !this._tree.isleaf(this._tree.postorderselect(node)) &&
                    !this._collapsedClades.hasOwnProperty(node)
                ) {
                    // An arc will be created for all internal nodes.
                    // arcs are created by sampling up to 60 small lines along
                    // the arc spanned by rotating the line (arcx0, arcy0)
                    // arcendangle - arcstartangle radians. This will create an
                    // arc that starts at each internal node's rightmost child
                    // and ends on the leftmost child.
                    var arcDeltaAngle =
                        this.getNodeInfo(node, "arcendangle") -
                        this.getNodeInfo(node, "arcstartangle");
                    var numSamples = this._numSampToApproximate(arcDeltaAngle);
                    for (var line = 0; line < numSamples; line++) {
                        addPoint();
                    }
                }
            } else {
                // Draw nodes for the unrooted layout.
                // coordinate info for parent
                addPoint();
            }
        }
        return new Float32Array(coords);
    };

    /**
     * Creates an SVG string to export the current drawing
     * Exports a SVG image of the tree.
     *
     * @return {String} svg
     */
    Empress.prototype.exportTreeSVG = function () {
        return ExportUtil.exportTreeSVG(this, this._drawer);
    };

    /**
     * Exports a PNG image of the canvas.
     *
     * This works a bit differently from the SVG exporting functions -- instead
     * of returning a string with the SVG, the specified callback will be
     * called with the Blob representation of the PNG. See
     * ExportUtil.exportTreePNG() for details.
     *
     * @param {Function} callback Function that will be called with a Blob
     *                            representing the exported PNG image.
     */
    Empress.prototype.exportTreePNG = function (callback) {
        ExportUtil.exportTreePNG(this, this._canvas, callback);
    };

    /**
     * Retrieves x coordinate of node in the current layout.
     *
     * @param {Number} node Postorder position of node.
     * @return {Number} x coordinate of node.
     */
    Empress.prototype.getX = function (node) {
        var xname = "x" + this._layoutToCoordSuffix[this._currentLayout];
        return this.getNodeInfo(node, xname);
    };

    /**
     * Retrieves y coordinate of node in the current layout.
     *
     * @param {Number} node Postorder position of node.
     * @return {Number} y coordinate of node.
     */
    Empress.prototype.getY = function (node) {
        var yname = "y" + this._layoutToCoordSuffix[this._currentLayout];
        return this.getNodeInfo(node, yname);
    };

    /**
     * Retrieves the node coordinate info (for drawing node circles).
     *
     * @return {Array} Node coordinate info, formatted like [x, y, RGB float]
     *                 for every node circle to be drawn.
     */
    Empress.prototype.getNodeCoords = function () {
        var tree = this._tree;
        var coords = [];
        var scope = this;
        var visible = function (node) {
            return scope.getNodeInfo(node, "visible");
        };
        var comp;

        if (this.drawNodeCircles === 0) {
            // draw internall node circles
            comp = function (node) {
                return (
                    visible(node) && !tree.isleaf(tree.postorderselect(node))
                );
            };
        } else if (this.drawNodeCircles === 1) {
            // draw all node circles
            comp = function (node) {
                return visible(node);
            };
        } else if (this.drawNodeCircles === 2) {
            // hide all node circles
            comp = function (node) {
                return false;
            };
        } else if (this.drawNodeCircles === 3) {
            // draw node with 1 descendant
            comp = function (node) {
                var treeNode = tree.postorderselect(node);
                return (
                    visible(node) &&
                    !tree.isleaf(treeNode) &&
                    tree.fchild(treeNode) === tree.lchild(treeNode)
                );
            };
        } else {
            throw new Error("getNodeCoords() drawNodeCircles is out of range");
        }
        for (var node of this._tree.postorderTraversal((includeRoot = true))) {
            if (!comp(node)) {
                continue;
            }
            // In the past, we only drew circles for nodes with an assigned
            // name (i.e. where the name of a node was not null). Now, we
            // just draw circles for all nodes.
            coords.push(
                this.getX(node),
                this.getY(node),
                this.getNodeInfo(node, "color")
            );
        }
        return new Float32Array(coords);
    };

    /**
     * Returns the number of lines/triangles to approximate an arc/wedge given
     * the total angle of the arc/wedge.
     *
     * @param {Number} totalAngle The total angle of the arc/wedge
     * @return {Number} The number of lines/triangles to approximate the arc
     *                  or wedge.
     */
    Empress.prototype._numSampToApproximate = function (totalAngle) {
        var numSamples = Math.floor(60 * Math.abs(totalAngle / Math.PI));
        return numSamples >= 2 ? numSamples : 2;
    };

    /**
     * Returns an Object describing circular layout angle information for a
     * node.
     *
     * @param {Number} node Postorder position of a node in the tree.
     * @param {Number} halfAngleRange A number equal to (2pi) / (# leaves in
     *                                the tree), used to determine the lower
     *                                and upper angles. This is accepted as a
     *                                parameter rather than computed here so
     *                                that, if this function is called multiple
     *                                times in succession when drawing a
     *                                barplot layer, this value can be computed
     *                                just once for this layer up front.
     *
     * @return {Object} angleInfo An Object with the following keys:
     *                             -angle
     *                             -lowerAngle
     *                             -upperAngle
     *                             -angleCos
     *                             -angleSin
     *                             -lowerAngleCos
     *                             -lowerAngleSin
     *                             -upperAngleCos
     *                             -upperAngleSin
     *                            This Object can be passed directly into
     *                            this._addCircularBarCoords() as its angleInfo
     *                            parameter.
     *
     * @throws {Error} If the current layout is not "Circular".
     */
    Empress.prototype._getNodeAngleInfo = function (node, halfAngleRange) {
        if (this._currentLayout === "Circular") {
            var angle = this.getNodeInfo(node, "angle");
            var lowerAngle = angle - halfAngleRange;
            var upperAngle = angle + halfAngleRange;
            var angleCos = Math.cos(angle);
            var angleSin = Math.sin(angle);
            var lowerAngleCos = Math.cos(lowerAngle);
            var lowerAngleSin = Math.sin(lowerAngle);
            var upperAngleCos = Math.cos(upperAngle);
            var upperAngleSin = Math.sin(upperAngle);
            return {
                angle: angle,
                lowerAngle: lowerAngle,
                upperAngle: upperAngle,
                angleCos: angleCos,
                angleSin: angleSin,
                lowerAngleCos: lowerAngleCos,
                lowerAngleSin: lowerAngleSin,
                upperAngleCos: upperAngleCos,
                upperAngleSin: upperAngleSin,
            };
        } else {
            // We need to throw this error, because if we're not in the
            // rectangular layout then nodes will not have a meaningful "angle"
            // attribute.
            throw new Error(
                "_getNodeAngleInfo() called when not in circular layout"
            );
        }
    };

    /**
     * Adds to an array of coordinates / colors the data needed to draw four
     * triangles (two rectangles) for a single bar in a circular layout
     * barplot.
     *
     * Since this only draws two rectangles, the resulting barplots look jagged
     * for small trees but look smooth enough for at least moderately-sized
     * trees.
     *
     * For a node with an angle pointing at the bottom-left of the screen, the
     * rectangles drawn here will look something like:
     *
     *     tR1        /
     *     /  \      /
     * tL1/    \    /
     *    \     \  *
     *     \     \bR-----tR2        (Inner radius)
     *      \    /         |
     *       \  /          |
     *        bL---------tL2        (Outer radius)
     *
     * Here, tL1 and tR2 are on the "lower angle" and tL2 and tR2 are on the
     * "upper angle," as specified in the angleInfo parameter.
     *
     * (This style of ASCII art [esp. the "using * to denote an arrow" thing]
     * mimics http://mathforum.org/dr.math/faq/formulas/faq.polar.html.)
     *
     * @param {Array} coords Array containing coordinate + color data, to be
     *                       passed to Drawer.loadBarplotBuff().
     * @param {Number} r1 Inner radius of the bar to draw.
     * @param {Number} r2 Outer radius of the bar to draw.
     * @param {Object} angleInfo Object returned by this._getNodeAngleInfo()
     *                           for the node this bar is being drawn for.
     * @param {Array} color The GL color to draw / fill both triangles with.
     */
    Empress.prototype._addCircularBarCoords = function (
        coords,
        r1,
        r2,
        angleInfo,
        color
    ) {
        // Polar coordinates (of the form (radius, theta)) can be converted
        // to Cartesian coordinates (x, y) by using the formulae:
        //  x = radius * cos(theta)
        //  y = radius * sin(theta)
        // Every coordinate defined by these arrays is being converted from
        // Polar to Cartesian, since we know the radius and angle (theta) of
        // these coordinates (and therefore the Polar coordinates).
        // For more detail on this, see for example
        // https://tutorial.math.lamar.edu/classes/calcii/polarcoordinates.aspx
        var centerBL = [r2 * angleInfo.angleCos, r2 * angleInfo.angleSin];
        var centerBR = [r1 * angleInfo.angleCos, r1 * angleInfo.angleSin];
        var t1 = {
            tL: [r2 * angleInfo.lowerAngleCos, r2 * angleInfo.lowerAngleSin],
            tR: [r1 * angleInfo.lowerAngleCos, r1 * angleInfo.lowerAngleSin],
            bL: centerBL,
            bR: centerBR,
        };
        var t2 = {
            tL: [r2 * angleInfo.upperAngleCos, r2 * angleInfo.upperAngleSin],
            tR: [r1 * angleInfo.upperAngleCos, r1 * angleInfo.upperAngleSin],
            bL: centerBL,
            bR: centerBR,
        };
        this._addTriangleCoords(coords, t1, color);
        this._addTriangleCoords(coords, t2, color);
    };

    /**
     * Adds to an array of coordinates / colors the data needed to draw two
     * triangles (one rectangle) for a single bar in a rectangular layout
     * barplot.
     *
     * This is a simple convenience function that just calls
     * Empress._addTriangleCoords() to do most of its work.
     *
     * @param {Array} coords Array containing coordinate + color data, to be
     *                       passed to Drawer.loadBarplotBuff().
     * @param {Number} lx Leftmost x-coordinate of the rectangle to draw.
     * @param {Number} rx Rightmost x-coordinate of the rectangle to draw.
     * @param {Number} by Bottommost y-coordinate of the rectangle to draw.
     * @param {Number} ty Topmost y-coordinate of the rectangle to draw.
     * @param {Array} color The GL color to draw / fill both triangles with.
     */
    Empress.prototype._addRectangularBarCoords = function (
        coords,
        lx,
        rx,
        by,
        ty,
        color
    ) {
        var corners = {
            tL: [lx, ty],
            tR: [rx, ty],
            bL: [lx, by],
            bR: [rx, by],
        };
        this._addTriangleCoords(coords, corners, color);
    };

    /**
     * Adds to an array of coordinates / colors the data needed to draw two
     * triangles.
     *
     * The two triangles drawn should look as follows:
     *
     * tL--tR
     * | \  |
     * |  \ |
     * bL--bR
     *
     * ...where all of the area is filled in, giving the impression of just
     * a rectangle (or generic quadrilateral, if e.g. tL isn't directly above
     * bL) being drawn.
     *
     * Note that this doesn't do any validation on the relative positions of
     * the corners coordinates, so if those are messed up (e.g. you're trying
     * to draw the rectangle shown above but you accidentally swap bL and tL)
     * then this will just draw something weird.
     *
     * (Also note that we can modify coords because JS uses "Call by sharing"
     * for Arrays/Objects; see http://jasonjl.me/blog/2014/10/15/javascript.)
     *
     * @param {Array} coords Array containing coordinate + color data, to be
     *                       passed to Drawer.loadThickNodeBuff().
     * @param {Object} corners Object with tL, tR, bL, and bR entries (each
     *                         mapping to an array of the format [x, y]
     *                         indicating this position).
     * @param {Array} color The GL color to draw / fill both triangles with.
     *                      Should be an RGB array (e.g. [1, 0, 0] for red).
     */
    Empress.prototype._addTriangleCoords = function (coords, corners, color) {
        // Triangle 1
        coords.push(...corners.tL);
        coords.push(color);
        coords.push(...corners.bL);
        coords.push(color);
        coords.push(...corners.bR);
        coords.push(color);
        // Triangle 2
        coords.push(...corners.tL);
        coords.push(color);
        coords.push(...corners.tR);
        coords.push(color);
        coords.push(...corners.bR);
        coords.push(color);
    };

    /* Adds coordinate/color info for a vertical line for a given node in the
     * rectangular layout. The vertices of the rectangle to be drawn look like:
     *
     * tL |-tR---
     * ---|
     * bL |-bR---
     *
     * @param {Array} coords  Array containing coordinate + color data, to be
     *                        passed to Drawer.loadThickNodeBuff().
     * @param {Number} node   Node index in this._treeData, from which we'll
     *                        retrieve coordinate information.
     * @param {Number} lwScaled Desired line thickness (note that this will be
     *                          applied on both sides of the line -- so if
     *                          lwScaled = 1 here then the drawn thick line
     *                          will have a width of 1 + 1 = 2).
     */
    Empress.prototype._addThickVerticalLineCoords = function (
        coords,
        node,
        lwScaled
    ) {
        var corners = {
            tL: [
                this.getX(node) - lwScaled,
                this.getNodeInfo(node, "highestchildyr"),
            ],
            tR: [
                this.getX(node) + lwScaled,
                this.getNodeInfo(node, "highestchildyr"),
            ],
            bL: [
                this.getX(node) - lwScaled,
                this.getNodeInfo(node, "lowestchildyr"),
            ],
            bR: [
                this.getX(node) + lwScaled,
                this.getNodeInfo(node, "lowestchildyr"),
            ],
        };
        var color = this.getNodeInfo(node, "color");
        this._addTriangleCoords(coords, corners, color);
    };

    /**
     * Thickens the colored branches of the tree.
     *
     * @param {Number} lw Amount of thickness to use, in the same "units"
     *                    that the user can enter in one of the line width
     *                    <input>s. If this is 0, this function won't do
     *                    anything. (If this is < 0, this will throw an error.
     *                    But this really shouldn't happen, since this
     *                    parameter should be the output from
     *                    util.parseAndValidateNum().)
     */
    Empress.prototype.thickenColoredNodes = function (lw) {
        // If lw isn't > 0, then we don't thicken colored lines at all --
        // we just leave them at their default width.
        if (lw < 0) {
            // should never happen because util.parseAndValidateNum()
            // should've been called in order to obtain lw, but in case
            // this gets messed up in the future we'll catch it
            throw "Line width passed to thickenColoredNodes() is < 0.";
        } else {
            // Make sure that, even if lw is 0 (i.e. we don't need to
            // thicken the lines), we still set the current line width
            // accordingly. This way, when doing things like updating the
            // layout that'll require re-drawing the tree based on the most
            // recent settings, we'll have access to the correct line width.
            this._currentLineWidth = lw;
            if (lw === 0) {
                // But, yeah, if lw is 0 we can just return early.
                return;
            }
        }
        // Scale the line width in such a way that trees with more leaves have
        // "smaller" line width values than trees with less leaves. This is a
        // pretty arbitrary equation based on messing around and seeing what
        // looked nice on mid- and small-sized trees; as a TODO for the future,
        // there is almost certainly a better way to do this.
        var lwScaled =
            (2 * lw) / Math.pow(Math.log10(this._tree.numleaves()), 2);
        var tree = this._tree;

        // the coordinates of the tree
        var coords = [];
        this._drawer.loadThickNodeBuff([]);

        // define these variables so jslint does not complain
        var x1, y1, x2, y2, corners;

        // In the corner case where the root node (located at index tree.size)
        // has an assigned color, thicken the root's drawn vertical line when
        // drawing the tree in Rectangular layout mode
        if (
            this._currentLayout === "Rectangular" &&
            this.getNodeInfo(tree.size, "isColored")
        ) {
            this._addThickVerticalLineCoords(coords, tree.size, lwScaled);
        }
        // iterate through the tree in postorder, skip root
        for (var node of this._tree.postorderTraversal()) {
            // name of current node
            var parent = tree.postorder(
                tree.parent(tree.postorderselect(node))
            );

            if (
                this._collapsedClades.hasOwnProperty(node) ||
                !this.getNodeInfo(node, "visible") ||
                !this.getNodeInfo(node, "isColored")
            ) {
                continue;
            }

            var color = this.getNodeInfo(node, "color");
            if (this._currentLayout === "Rectangular") {
                // Draw a thick vertical line for this node, if it isn't a tip
                if (this.getNodeInfo(node, "lowestchildyr") !== undefined) {
                    this._addThickVerticalLineCoords(coords, node, lwScaled);
                }
                /* Draw a horizontal thick line for this node -- we can safely
                 * do this for all nodes since this ignores the root, and all
                 * nodes except for the root (at least as of writing) have a
                 * horizontal line portion in the rectangular layout.
                 * tL   tR---
                 * -----|
                 * bL   bR---
                 */
                corners = {
                    tL: [this.getX(parent), this.getY(node) + lwScaled],
                    tR: [this.getX(node), this.getY(node) + lwScaled],
                    bL: [this.getX(parent), this.getY(node) - lwScaled],
                    bR: [this.getX(node), this.getY(node) - lwScaled],
                };
                this._addTriangleCoords(coords, corners, color);
            } else if (this._currentLayout === "Circular") {
                // Thicken the "arc" if this is non-root internal node
                // (TODO: this will need to be adapted when the arc is changed
                // to be a bezier curve)
                if (!this._tree.isleaf(this._tree.postorderselect(node))) {
                    // An arc will be created for all internal nodes.
                    // See getCoords() for details on how arcs are drawn.
                    var arcDeltaAngle =
                        this.getNodeInfo(node, "arcendangle") -
                        this.getNodeInfo(node, "arcstartangle");
                    var numSamples = this._numSampToApproximate(arcDeltaAngle);
                    var sampleAngle = arcDeltaAngle / numSamples;
                    var sX = this.getNodeInfo(node, "arcx0");
                    var sY = this.getNodeInfo(node, "arcy0");
                    for (var line = 0; line < numSamples; line++) {
                        x1 =
                            sX * Math.cos(line * sampleAngle) -
                            sY * Math.sin(line * sampleAngle);
                        y1 =
                            sX * Math.sin(line * sampleAngle) +
                            sY * Math.cos(line * sampleAngle);
                        x2 =
                            sX * Math.cos((line + 1) * sampleAngle) -
                            sY * Math.sin((line + 1) * sampleAngle);
                        y2 =
                            sX * Math.sin((line + 1) * sampleAngle) +
                            sY * Math.cos((line + 1) * sampleAngle);
                        var arc0corners = VectorOps.computeBoxCorners(
                            x1,
                            y1,
                            x2,
                            y2,
                            lwScaled
                        );
                        var arc1corners = VectorOps.computeBoxCorners(
                            x1,
                            y1,
                            x2,
                            y2,
                            lwScaled
                        );
                        this._addTriangleCoords(coords, arc0corners, color);
                        this._addTriangleCoords(coords, arc1corners, color);
                    }
                }
                // Thicken the actual "node" portion, extending from the center
                // of the layout
                x1 = this.getNodeInfo(node, "xc0");
                y1 = this.getNodeInfo(node, "yc0");
                x2 = this.getX(node);
                y2 = this.getY(node);
                corners = VectorOps.computeBoxCorners(x1, y1, x2, y2, lwScaled);
                this._addTriangleCoords(coords, corners, color);
            } else {
                x1 = this.getX(parent);
                y1 = this.getY(parent);
                x2 = this.getX(node);
                y2 = this.getY(node);
                corners = VectorOps.computeBoxCorners(x1, y1, x2, y2, lwScaled);
                this._addTriangleCoords(coords, corners, color);
            }
        }

        this._drawer.loadThickNodeBuff(coords);
    };

    /**
     * Given a node and an arbitrary number, returns the maximum of the node's
     * x-coordinate and the arbitrary number.
     *
     * Assumes that the tree is in the Rectangular layout.
     *
     * @param {Number} node Postorder position of a node in the tree
     * @param {Number} m Arbitrary number
     *
     * @return {Number} maximum of (node's x-coordinate, m)
     */
    Empress.prototype._getMaxOfXAndNumber = function (node, m) {
        var x = this.getX(node);
        return Math.max(x, m);
    };

    /**
     * Given a node and an arbitrary number, returns the maximum of the node's
     * radius (its distance from (0, 0)) in the circular layout and the
     * arbitrary number.
     *
     * Assumes that the tree is in the Circular layout.
     *
     * NOTE that by radius we do not mean "the size of the node's circle"
     * -- instead we're referring to part of its polar coordinate position
     * (since those can be written as (radius, theta)).
     *
     * @param {Number} node Postorder position of a node in the tree
     * @param {Number} m Arbitrary number
     *
     * @return {Number} maximum of (node's radius, m)
     */
    Empress.prototype._getMaxOfRadiusAndNumber = function (node, m) {
        // We don't currently store nodes' radii, so we figure this
        // out by looking at the node's x-coordinate and angle.
        // Since x-coordinates are equal to r*cos(theta), we can
        // divide a given node's x-coordinate by cos(theta) to get
        // its radius. I know we can get the same result by
        // computing sqrt(x^2 + y^2) (a.k.a. distance from the
        // root at (0, 0)), but this seems faster. (There is still
        // probably an even faster way to do this though; maybe a
        // preorder traversal through the tree to see which tip has
        // the largest cumulative length, then scale that to the
        // radius value in the layout? Not sure if this step is a
        // bottleneck worth spending time working on, though.)
        var r = this.getX(node) / Math.cos(this.getNodeInfo(node, "angle"));
        return Math.max(r, m);
    };

    /**
     * Computes the closest-to-the-root point at which we can start drawing
     * barplots in the current layout.
     *
     * For the rectangular layout, this means looking for the rightmost node's
     * x-coordinate; for the circular layout, this means looking for the node
     * farthest away from the root's distance from the root (a.k.a. radius,
     * since the root is (0, 0) so we can think of the circular layout in terms
     * of polar coordinates).
     *
     * This function doesn't return anything; its only effects are updating
     * this._maxDisplacement and updating this._barplotUnit (which is
     * proportional to the max displacement).
     *
     * If the current layout does not support barplots, then
     * this._maxDisplacement is set to null.
     */
    Empress.prototype._computeMaxDisplacement = function () {
        var maxD = -Infinity;
        var compFunc;
        // The purpose of this variable is to make barplots have effectively
        // the same "thickness" from the user's perspective, proportional to
        // the tree's "thickness" (regardless of the layout).
        //
        // In the rectangular layout, this is set to 1, so that 100 barplot
        // units (the default length for all barplot layers, as of writing) is
        // 1/10th of the max displacement.
        //
        // Total tree width = 10
        //  __________
        // |   _       | |
        // |--|_       | |
        // |__         | |
        //
        // In the circular layout, the tree looks twice as "thick," because the
        // max displacement is only the radius of the circle:
        //
        // Total tree diameter = 20
        //
        //          |
        //       +--+
        //      / \
        //     /   \
        //    -+    +----------
        //          |
        //          |
        //
        // (... I don't know how to draw a circle of barplots around that in
        // ASCII art, but please feel free to imagine it :P)
        //
        // Anyway, to compensate for this, we use a factor of 2 for the
        // circular layout to make the barplots twice as thick (and therefore
        // scale with the tree diameter). I'm not 100% sure that this is the
        // best way to handle this problem, but it looks good enough and the
        // lengths are configurable anyway so I don't think it matters much.
        var layoutFactor;
        if (this._currentLayout === "Rectangular") {
            compFunc = "_getMaxOfXAndNumber";
            layoutFactor = 1;
        } else if (this._currentLayout === "Circular") {
            compFunc = "_getMaxOfRadiusAndNumber";
            layoutFactor = 2;
        } else {
            this._maxDisplacement = null;
            return;
        }
        for (var node of this._tree.postorderTraversal()) {
            if (this._tree.isleaf(this._tree.postorderselect(node))) {
                maxD = this[compFunc](node, maxD);
            }
        }
        this._maxDisplacement = maxD;
        this._barplotUnit = (this._maxDisplacement / 1000) * layoutFactor;
    };

    /**
     * Clears the barplot buffer and re-draws the tree.
     *
     * This is useful for immediately disabling barplots, for example if the
     * layout is switched to one that doesn't support barplots (e.g. unrooted)
     * or if the user unchecks the "Draw barplots?" checkbox.
     */
    Empress.prototype.undrawBarplots = function () {
        this._drawer.loadBarplotBuff([]);
        this.drawTree();
        this._barplotsDrawn = false;
    };

    /**
     * Computes the coordinate data needed for drawing a collection of barplot
     * layer(s), as well as additional information needed for populating the
     * corresponding barplot legends.
     *
     * Similar to this.getCoords().
     *
     * @param {Array} layers Collection of BarplotLayer objects. Layers will be
     *                       drawn starting from the edge of the tree and going
     *                       outwards: the first layer in the array will be the
     *                       innermost and the last will be the outermost
     *                       (ignoring barplot border layers, which may be
     *                       added depending on the BarplotPanel's state).
     *
     * @returns {Object} Contains three entries:
     *                   -coords: An array of coordinate data, in the format
     *                    [x, y, RGB...]
     *                   -colorers: An Array of the same length as the number
     *                    of barplot layers containing in each position either
     *                    a Colorer object (for layers for which a color legend
     *                    should be shown) or null (for layers for which no
     *                    color legend should be shown).
     *                   -lengthExtrema: An Array of the same length as the
     *                    number of barplot layers containing in each position
     *                    either another Array of two elements (the minimum and
     *                    maximum value to be shown in a length legend) or
     *                    null (for layers for which no length legend should be
     *                    shown).
     *
     * @throws {Error} If any of the following conditions are met:
     *                 -One of the layers is of barplot type "fm" and:
     *                    -A field with < 2 unique numeric values is used to
     *                     scale colors
     *                    -A field with < 2 unique numeric values is used to
     *                     scale lengths
     *                    -Length scaling is attempted, and the layer's
     *                     scaleLengthByFMMax attribute is smaller than its
     *                     scaleLengthByFMMin attribute
     */
    Empress.prototype.getBarplotData = function (layers) {
        var scope = this;

        if (!this._barplotPanel.isLayoutSupported(this._currentLayout)) {
            throw new Error(
                "Non-barplot-supporting layout '" +
                    this._currentLayout +
                    "' in use."
            );
        }

        // The main thing that will be returned by this function
        var barplotBuffer = [];

        // Add on a gap between the closest-to-the-root point at which we can
        // start drawing barplots, and the first barplot layer. (It's possible
        // for this._barplotPanel.distBtwnTreeAndBarplots to be 0, in which
        // case there isn't a gap -- this looks kinda bad if node circles are
        // drawn because the node circle of the tip(s) at this max displacement
        // are partially covered by the barplots -- hence why this isn't the
        // default).
        var maxD =
            this._maxDisplacement +
            this._barplotPanel.distBtwnTreeAndBarplots * this._barplotUnit;

        // As we iterate through the layers, we'll store the "previous layer
        // max D" as a separate variable. This will help us easily work with
        // layers of varying lengths.
        var prevLayerMaxD = maxD;

        // As we iterate through the layers, we'll also store the Colorer
        // that was used for each layer (or null, if no Colorer was used --
        // i.e. for feature metadata barplots with no color encoding). At the
        // end of this function, when we know that all barplots are valid,
        // we'll populate / clear legends accordingly.
        var colorers = [];

        // Also, we keep track of length-scaling information as well. These are
        // just arrays of [min val, max val]. (Or they'll just be null, if no
        // length scaling was done -- this is always the case for e.g. stacked
        // sample metadata barplots.)
        var lengthExtrema = [];

        _.each(layers, function (layer) {
            if (scope._barplotPanel.useBorders) {
                prevLayerMaxD = scope.addBorderBarplotLayerCoords(
                    barplotBuffer,
                    prevLayerMaxD
                );
            }
            var layerInfo;
            // Normally I'd just set addLayerFunc as a reference to
            // scope.addSMBarplotLayerCoords (or ...FM...), but that apparently
            // breaks references to "this". Using func names is a workaround.
            var addLayerFunc;
            if (layer.barplotType === "sm") {
                addLayerFunc = "addSMBarplotLayerCoords";
            } else {
                addLayerFunc = "addFMBarplotLayerCoords";
            }
            // The meat of the work here: compute the coordinates needed for
            // each barplot layer. These functions may throw errors as needed
            // if certain selections are invalid.
            layerInfo = scope[addLayerFunc](
                layer,
                barplotBuffer,
                prevLayerMaxD
            );
            prevLayerMaxD = layerInfo[0];
            colorers.push(layerInfo[1]);
            lengthExtrema.push(layerInfo[2]);
        });
        // Add a border on the outside of the outermost layer
        if (this._barplotPanel.useBorders) {
            this.addBorderBarplotLayerCoords(barplotBuffer, prevLayerMaxD);
        }
        return {
            coords: barplotBuffer,
            colorers: colorers,
            lengthExtrema: lengthExtrema,
        };
    };

    /**
     * Returns the current BarplotLayers owned by the BarplotPanel.
     *
     * @returns {Array} Array of BarplotLayer objects.
     */
    Empress.prototype.getBarplotLayers = function () {
        return this._barplotPanel.layers;
    };

    /**
     * Draws barplots on the tree.
     *
     * @throws {Error} If user selections for a barplot layer are invalid; see
     *                 this.getBarplotData() for details.
     */
    Empress.prototype.drawBarplots = function () {
        var scope = this;
        var layers = this.getBarplotLayers();
        var barplotData = this.getBarplotData(layers);
        // NOTE that we purposefuly don't clear the barplot buffer until we
        // know all of the barplots are valid. If we were to call
        // this.loadBarplotBuff([]) at the start of this function, then if we'd
        // error out in this.getBarplotData(), the barplot buffer would be
        // cleared without the tree being redrawn; this would result in the
        // barplots disappearing the next time the user did something that
        // prompted a redrawing of the tree (e.g. zooming or panning), which
        // would be confusing.
        this._drawer.loadBarplotBuff([]);
        this._drawer.loadBarplotBuff(barplotData.coords);
        this.drawTree();

        // By the same logic, now we can safely update the barplot legends to
        // match the barplots that are now drawn.
        _.each(barplotData.colorers, function (colorer, layerIndex) {
            if (_.isNull(colorer)) {
                layers[layerIndex].clearColorLegend();
            } else {
                layers[layerIndex].populateColorLegend(colorer);
            }
        });
        _.each(barplotData.lengthExtrema, function (valSpan, layerIndex) {
            if (_.isNull(valSpan)) {
                layers[layerIndex].clearLengthLegend();
            } else {
                layers[layerIndex].populateLengthLegend(...valSpan);
            }
        });

        // Finally, we can say that barplots have been drawn :)
        this._barplotsDrawn = true;
    };

    /**
     * Adds a sample metadata barplot layer's coordinates to an array.
     *
     * @param {BarplotLayer} layer The layer to be drawn.
     * @param {Array} coords The array to which the coordinates for this layer
     *                       will be added.
     * @param {Number} prevLayerMaxD The "displacement" (either in
     *                               x-coordinates, or in radius coordinates)
     *                               to use as the starting point for drawing
     *                               this layer's bars.
     *
     * @return {Array} layerInfo An array containing three elements:
     *                           1. The maximum displacement of a bar within
     *                              this layer (this should really just be
     *                              prevLayerMaxD + layer.lengthSM, since all
     *                              tips' bars in a stacked sample metadata
     *                              barplot have the same length)
     *                           2. The Colorer used to assign colors to sample
     *                              metadata values
     *                           3. Just null (in the future, this could be
     *                              changed to provide length-scaling legend
     *                              information, as is done in
     *                              addFMBarplotLayerCoords(); however for now
     *                              that isn't supported.)
     */
    Empress.prototype.addSMBarplotLayerCoords = function (
        layer,
        coords,
        prevLayerMaxD
    ) {
        var scope = this;
        var sortedUniqueValues = this.getUniqueSampleValues(
            layer.colorBySMField
        );
        var colorer = new Colorer(
            layer.colorBySMColorMap,
            sortedUniqueValues,
            undefined,
            undefined,
            layer.colorBySMColorReverse
        );
        var sm2color = colorer.getMapRGB();
        // Do most of the hard work: compute the frequencies for each tip (only
        // the tips present in the BIOM table, that is)
        var feature2freqs = this._biom.getFrequencyMap(layer.colorBySMField);

        // Only bother computing the halfyrscf / halfAngleRange value we need.
        // (this._tree.numleaves() does iterate over the full tree, at least
        // as of writing, so avoiding calling it if possible is a good idea.)
        // NOTE: This code is duplicated between this function and
        // addFMBarplotLayerCoords(). Not sure if it's worth the work to
        // abstract it, though, since it boils down to ~6 lines.
        var halfyrscf, halfAngleRange;
        if (this._currentLayout === "Rectangular") {
            // Bar thickness (rect layout barplots)
            halfyrscf = this._yrscf / 2;
        } else {
            // Bar thickness (circular layout barplots)
            // This is really (2pi / # leaves) / 2, but the 2s cancel
            // out so it's just pi / # leaves
            halfAngleRange = Math.PI / this._tree.numleaves();
        }

        var layerLength = layer.lengthSM * this._barplotUnit;

        // For each tip in the BIOM table...
        // (We implicitly ignore [and don't draw anything for] tips that
        // *aren't* in the BIOM table.)
        _.each(feature2freqs, function (freqs, node) {
            // This variable defines the left x-coordinate (or inner radius)
            // for drawing the next "section" of the stacked barplot.
            // It'll be updated as we iterate through the unique values in this
            // sample metadata field below.
            var prevSectionMaxD = prevLayerMaxD;

            // Compute y-coordinate / angle information up front. Doing this
            // here lets us compute this only once per tip (per layer), rather
            // than computing this for every section in the stacked barplot --
            // doable b/c this information is constant through the sections.
            var y, ty, by;
            var angleInfo;
            if (scope._currentLayout === "Rectangular") {
                y = scope.getY(node);
                ty = y + halfyrscf;
                by = y - halfyrscf;
            } else {
                // NOTE: In this function and in addFMBarplotLayerCoords(), we
                // don't bother checking if scope._currentLayout is not
                // Rectangular / Circular. This should already have been
                // checked for by the caller.
                angleInfo = scope._getNodeAngleInfo(node, halfAngleRange);
            }

            // For each unique value for this sample metadata field...
            // NOTE: currently we iterate through all of sortedUniqueValues
            // once for every tip in the table, detecting and skipping
            // unique values where no samples contain this tip.
            // The reason we do things this way, rather than just
            // iterating directly over the keys of this tip's Object within
            // the frequency map, is that we want to ensure that unique
            // values are processed in the same order for every tip (so for
            // a "body site" barplot you'd always see e.g. gut, left palm,
            // right palm, tongue in that order).
            //
            // Ideally we'd skip having to do this full iteration, though,
            // and only look at the unique values containing this tip from
            // the start (saving time). This might require refactoring the
            // output of BiomTable.getFrequencyMap(), though.
            for (var v = 0; v < sortedUniqueValues.length; v++) {
                var smVal = sortedUniqueValues[v];
                var freq = freqs[smVal];
                // Ignore sample metadata values where no sample with this
                // value contains this tip. We can detect this using
                // !_.isUndefined() because freqs should only include
                // entries for metadata values where this feature is
                // present in at least one sample with that value.
                if (!_.isUndefined(freq)) {
                    var sectionColor = sm2color[smVal];
                    var barSectionLen = layerLength * freq;
                    // Assign each unique sample metadata value a length
                    // proportional to its, well, proportion within the sample
                    // presence information for this tip.
                    var thisSectionMaxD = prevSectionMaxD + barSectionLen;
                    if (scope._currentLayout === "Rectangular") {
                        scope._addRectangularBarCoords(
                            coords,
                            prevSectionMaxD,
                            thisSectionMaxD,
                            by,
                            ty,
                            sectionColor
                        );
                    } else {
                        scope._addCircularBarCoords(
                            coords,
                            prevSectionMaxD,
                            thisSectionMaxD,
                            angleInfo,
                            sectionColor
                        );
                    }
                    prevSectionMaxD = thisSectionMaxD;
                }
            }
        });
        // The bar lengths are identical for all tips in this layer, so no need
        // to do anything fancy to compute the maximum displacement. (So the
        // max displacement is just the initial max displacement plus the
        // length for each bar in this layer.)
        //
        // null is the final element in this list because, as mentioned above,
        // length-scaling is currently not supported for sample metadata
        // barplots. The null indicates that no length legend should be drawn
        // for this layer. When we get around to supporting scaling sample
        // metadata barplots by length (see issue #353 on GitHub), we'll just
        // need to replace the null.
        return [prevLayerMaxD + layerLength, colorer, null];
    };

    /**
     * Adds a feature metadata barplot layer's coordinates to an array.
     *
     * @param {BarplotLayer} layer The layer to be drawn.
     * @param {Array} coords The array to which the coordinates for this layer
     *                       will be added.
     * @param {Number} prevLayerMaxD The "displacement" (either in
     *                               x-coordinates, or in radius coordinates)
     *                               to use as the starting point for drawing
     *                               this layer's bars.
     *
     * @return {Array} layerInfo An array containing three elements:
     *                           1. The maximum displacement of a bar within
     *                              this layer
     *                           2. The Colorer used to assign colors to
     *                              feature metadata values, if layer.colorByFM
     *                              is truthy. (If layer.colorByFM is falsy,
     *                              then this will just be null, indicating
     *                              that no color legend should be shown for
     *                              this layer.)
     *                           3. If layer.scaleLengthByFM is truthy, an
     *                              array containing two elements:
     *                              1. the minimum value in the layer's
     *                                 layer.scaleLengthByFMField field.
     *                              2. the maximum value in the layer's
     *                                 layer.scaleLengthByFMField field.
     *                              If layer.scaleLengthByFM is falsy, then
     *                              this will just be null, indicating that no
     *                              length legend should be shown for this
     *                              layer.
     *
     * @throws {Error} If continuous color or length scaling is requested, but
     *                 the feature metadata field used for either scaling
     *                 operation does not contain at least two unique numeric
     *                 values.
     */
    Empress.prototype.addFMBarplotLayerCoords = function (
        layer,
        coords,
        prevLayerMaxD
    ) {
        var maxD = prevLayerMaxD;
        var colorer = null;
        var fm2color, colorFMIdx;
        var lenValMin = null;
        var lenValMax = null;
        var fm2length, lengthFMIdx;
        // Map feature metadata values to colors, if requested (i.e. if
        // layer.colorByFM is true). If not requested, we'll just use the
        // layer's default color.
        if (layer.colorByFM) {
            var sortedUniqueColorValues = this.getUniqueFeatureMetadataInfo(
                layer.colorByFMField,
                "tip"
            ).sortedUniqueValues;
            // If this field is invalid then an error would have been
            // raised in this.getUniqueFeatureMetadataInfo().
            // (But... it really shouldn't be.)
            colorFMIdx = _.indexOf(
                this._featureMetadataColumns,
                layer.colorByFMField
            );
            // We pass the true/false value of the "Continuous values?"
            // checkbox to Colorer regardless of if the selected color map
            // is discrete or sequential/diverging. This is because the Colorer
            // class constructor is smart enough to ignore useQuantScale = true
            // if the color map is discrete in the first place. (This is tested
            // in the Colorer tests; ctrl-F for "CVALDISCRETETEST" in
            // tests/test-colorer.js to see this.)
            try {
                colorer = new Colorer(
                    layer.colorByFMColorMap,
                    sortedUniqueColorValues,
                    layer.colorByFMContinuous,
                    layer.uniqueNum,
                    layer.colorByFMColorReverse
                );
            } catch (err) {
                // If the Colorer construction failed (should only have
                // happened if the user asked for continuous values but the
                // selected field doesn't have at least 2 unique numeric
                // values), then we open a toast message about this error and
                // then raise it again (with some more context, e.g. the field
                // name / barplot layer number). This lets us bail out of
                // drawing barplots while still keeping the user aware of why
                // nothing just got drawn/updated.
                var msg =
                    "Error with assigning colors in barplot layer " +
                    layer.num +
                    ": " +
                    'the feature metadata field "' +
                    layer.colorByFMField +
                    '" has less than 2 unique numeric values.';
                util.toastMsg(msg, 5000);
                throw msg;
            }
            fm2color = colorer.getMapRGB();
        }

        // Next, map feature metadata values to lengths if requested
        if (layer.scaleLengthByFM) {
            var sortedUniqueLengthValues = this.getUniqueFeatureMetadataInfo(
                layer.scaleLengthByFMField,
                "tip"
            ).sortedUniqueValues;
            lengthFMIdx = _.indexOf(
                this._featureMetadataColumns,
                layer.scaleLengthByFMField
            );
            try {
                [fm2length, lenValMin, lenValMax] = util.assignBarplotLengths(
                    sortedUniqueLengthValues,
                    layer.scaleLengthByFMMin,
                    layer.scaleLengthByFMMax,
                    layer.num,
                    layer.scaleLengthByFMField
                );
            } catch (err) {
                // Fail gracefully, similarly to how we handle Colorer errors
                // above
                util.toastMsg(err.message, 5000);
                throw err.message;
            }
        }

        // Now that we know how to encode each tip's bar, we can finally go
        // iterate through the tree and create bars for the tips.
        var halfyrscf, halfAngleRange;
        if (this._currentLayout === "Rectangular") {
            halfyrscf = this._yrscf / 2;
        } else {
            halfAngleRange = Math.PI / this._tree.numleaves();
        }
        // NOTE that, for drawing a barplot layer representing a taxonomy
        // column, we are essentially doing the work here of "reassembling"
        // the ancestor taxonomy with the child taxonomy info twice -- once
        // when we call this.getUniqueFeatureMetadataInfo() above, and again
        // as we go through this loop and look at each tip (this is done for
        // each tip by the "retrieval function" mentioned below).
        //
        // It would be ideal to use the mapping information returned by
        // this.getUniqueFeatureMetadataInfo() to avoid having to repeat this
        // work, although this would likely require restructuring the rest
        // of this function -- might be too much work for its own good.
        for (var node of this._tree.postorderTraversal()) {
            if (this._tree.isleaf(this._tree.postorderselect(node))) {
                var name = this.getNodeInfo(node, "name");
                var fm;
                // Assign this tip's bar a color
                var color;
                if (layer.colorByFM) {
                    // Get a function that'll retrieve feature metadata from
                    // this field for us. As of writing, only does anything
                    // special for certain taxonomy columns.
                    var getValFromColorFM = this._getFMValRetrievalFunction(
                        layer.colorByFMField
                    );

                    if (_.has(this._tipMetadata, node)) {
                        fm = getValFromColorFM(this._tipMetadata[node]);
                        if (_.has(fm2color, fm)) {
                            color = fm2color[fm];
                        } else {
                            // This tip has metadata, but its value for this
                            // field is non-numeric. Unlike Emperor, we don't
                            // assign a "NaN color" for these non-numeric vals.
                            // We could change this if requested.
                            continue;
                        }
                    } else {
                        // Don't draw a bar if this tip doesn't have
                        // feature metadata and we're coloring bars by
                        // feature metadata
                        continue;
                    }
                } else {
                    color = layer.defaultColor;
                }

                // Assign this tip's bar a length
                var length;
                if (layer.scaleLengthByFM) {
                    // Get a function that'll retrieve feature metadata from
                    // this field for us. As of writing, this currently is
                    // not especially useful for length scaling, since this
                    // function only does something special for taxonomy
                    // columns -- and those shouldn't be numeric. However,
                    // using this function as the middle-man here ensures
                    // consistency with how the other uses of feature metadata
                    // work (in case we define further special cases later on).
                    var getValFromLengthFM = this._getFMValRetrievalFunction(
                        layer.scaleLengthByFMField
                    );
                    if (_.has(this._tipMetadata, node)) {
                        fm = getValFromLengthFM(this._tipMetadata[node]);
                        if (_.has(fm2length, fm)) {
                            length = fm2length[fm];
                        } else {
                            // This tip has metadata, but its value for
                            // this field is non-numeric
                            continue;
                        }
                    } else {
                        // This tip has no metadata
                        continue;
                    }
                } else {
                    length = layer.defaultLength;
                }

                if (length === 0) {
                    // This tip maps to a length of 0, so don't waste
                    // resources trying to draw it.
                    continue;
                }

                // Update maxD if needed
                var thisLayerMaxD = prevLayerMaxD + length * this._barplotUnit;
                if (thisLayerMaxD > maxD) {
                    maxD = thisLayerMaxD;
                }

                // Finally, add this tip's bar data to an array of data
                // describing the bars to draw
                if (this._currentLayout === "Rectangular") {
                    var y = this.getY(node);
                    var ty = y + halfyrscf;
                    var by = y - halfyrscf;
                    this._addRectangularBarCoords(
                        coords,
                        prevLayerMaxD,
                        thisLayerMaxD,
                        by,
                        ty,
                        color
                    );
                } else {
                    this._addCircularBarCoords(
                        coords,
                        prevLayerMaxD,
                        thisLayerMaxD,
                        this._getNodeAngleInfo(node, halfAngleRange),
                        color
                    );
                }
            }
        }
        var lenValSpan = _.isNull(lenValMin) ? null : [lenValMin, lenValMax];
        return [maxD, colorer, lenValSpan];
    };

    /**
     * Adds coordinates for a "border" barplot layer to an array.
     *
     * @param {Array} coords The array to which the coordinates for this
     *                       "layer" will be added.
     * @param {Number} prevLayerMaxD The "displacement" (either in
     *                               x-coordinates, or in radius coordinates)
     *                               to use as the starting point for drawing
     *                               this layer's bars.
     *
     * @return {Number} maxD The maximum displacement of a bar within this
     *                       layer. This is really just prevLayerMaxD +
     *                       this._barplotPanel.borderLength.
     */
    Empress.prototype.addBorderBarplotLayerCoords = function (
        coords,
        prevLayerMaxD
    ) {
        var borderColor = this._barplotPanel.borderColor;
        var borderLength = this._barplotPanel.borderLength;
        var maxD = prevLayerMaxD + borderLength * this._barplotUnit;
        // TODO: Should be changed when the ability to change the background
        // color is added. Basically, we get a "freebie" if the border color
        // matches the background color, and we don't need to draw anything --
        // we can just increase the displacement and leave it at that.
        // (This works out very well if this is the "outermost" border -- then
        // we really don't need to do anything.)
        if (borderColor === Colorer.rgbToFloat(this._drawer.CLR_COL_RGB)) {
            return maxD;
        }
        // ... Otherwise, we actually have to go and create bars
        var halfyrscf, halfAngleRange;
        if (this._currentLayout === "Rectangular") {
            halfyrscf = this._yrscf / 2;
        } else {
            halfAngleRange = Math.PI / this._tree.numleaves();
        }
        // Currently, this just draws a bar for every tip. This is relatively
        // slow! For the rectangular layout, it should be possible to speed
        // this up by figuring out the topmost and bottommost node and then
        // drawing just two triangles (one rectangle, based on their y-values).
        // For the circular layout, how to speed this up is less clear -- I
        // suspect it should be possible using WebGL and some fancy
        // trigonometry somehow, but I'm not sure.
        for (var node of this._tree.postorderTraversal()) {
            if (this._tree.isleaf(this._tree.postorderselect(node))) {
                if (this._currentLayout === "Rectangular") {
                    var y = this.getY(node);
                    var ty = y + halfyrscf;
                    var by = y - halfyrscf;
                    this._addRectangularBarCoords(
                        coords,
                        prevLayerMaxD,
                        maxD,
                        by,
                        ty,
                        borderColor
                    );
                } else {
                    this._addCircularBarCoords(
                        coords,
                        prevLayerMaxD,
                        maxD,
                        this._getNodeAngleInfo(node, halfAngleRange),
                        borderColor
                    );
                }
            }
        }
        return maxD;
    };

    /**
     *
     * Color the tree by sample groups
     *
     * This method assumes we receive a list of samples and colors from
     * Emperor then it goes ahead and creates one group per color.
     *
     * @param {Array} sampleGroups - A list of sample identifiers
     */
    Empress.prototype.colorSampleGroups = function (sampleGroups) {
        var observationsPerGroup = {},
            obs;

        // get a group of observations per color
        for (var group in sampleGroups) {
            obs = this._biom.getObservationUnionForSamples(sampleGroups[group]);
            observationsPerGroup[group] = new Set(obs);
        }

        // project to ancestors
        observationsPerGroup = this._projectObservations(
            observationsPerGroup,
            this.ignoreAbsentTips
        );

        for (group in observationsPerGroup) {
            obs = Array.from(observationsPerGroup[group]);

            // convert hex string to rgb number
            var rgb = Colorer.hex2RGB(group);

            for (var i = 0; i < obs.length; i++) {
                this.setNodeInfo(obs[i], "color", rgb);
            }
        }

        this.drawTree();
    };

    /**
     * Color the tree using sample metadata
     *
     * @param {String} cat Sample metadata category to use
     * @param {String} color Color map to use
     * @param {Boolean} reverse Defaults to false. If true, the color scale
     *                         will be reversed, with respect to its default
     *                         orientation.
     *
     * @return {Object} If there exists at least one group with unique features
     *                  then an object will be returned that maps groups with
     *                  unique features to a color. If there doesn't exist a
     *                  group with unique features then null will be returned.
     */
    Empress.prototype.colorBySampleCat = function (
        cat,
        color,
        reverse = false
    ) {
        var tree = this._tree;
        var obs = this._biom.getObsBy(cat);
        var categories = Object.keys(obs);

        // Assign colors to categories
        var colorer = new Colorer(
            color,
            categories,
            undefined,
            undefined,
            reverse
        );
        // colors for drawing the tree
        var cm = colorer.getMapRGB();
        // colors for the legend
        var keyInfo = colorer.getMapHex();

        // if the tree has been sheared then categories in obs maybe empty.
        // getObsBy() does not filter out those categories so that the same
        // color can be assigned to each value in obs.
        for (var key in keyInfo) {
            if (obs[key].length === 0) {
                delete keyInfo[key];
            }
        }

        // shared by the following for loops
        var i, j, category;

        // convert observation IDs to _treeData keys
        for (i = 0; i < categories.length; i++) {
            category = categories[i];
            obs[category] = new Set(obs[category]);
        }

        // Assign internal nodes to appropriate category based on their
        // children. Note that _projectObservations()'s returned obs will
        // not contain categories that aren't unique to any tips. This is why
        // we created a Colorer above, so that we can include all unique sample
        // metadata values in the color map / legend.
        obs = this._projectObservations(obs, this.ignoreAbsentTips);

        // If there aren't *any* sample metadata values unique to any tips,
        // then return null so that the caller can warn the user.
        if (Object.keys(obs).length === 0) {
            return null;
        }

        // assigns node in obs to groups in this._groups
        this.assignGroups(obs);

        // color tree
        this._colorTree(obs, cm);

        this.updateLegendCategorical(cat, keyInfo);

        return keyInfo;
    };

    /**
     * Returns a function that retrieves values for a feature metadata column.
     *
     * The returned function takes as input an Array specifying a "row" in the
     * feature metadata (where each value corresponds to a different feature
     * metadata column: e.g. one very simple row might be
     * ["Bacteria", "Firmicutes", "1.25"], if the only feature metadata columns
     * are "Level 1", "Level 2", and "SomeRandomNumber").
     *
     * The "basic" case is that the returned function just retrieves a single
     * value from this row (e.g. if fmCol is "SomeRandomNumber", then the
     * returned function should retrieve "1.25" from the aforementioned example
     * row). However, it's possible for the returned function to behave
     * differently in special cases. As of writing, the only "special case" is
     * when fmCol is a non-highest-rank taxonomy column EMPress' Python code
     * produced (e.g. "Level 2" in the example above) -- in this case, the
     * returned function will retrieve and combine multiple values, producing
     * a merged taxonomy string down to a given level (e.g.
     * "Bacteria; Firmicutes").
     *
     * @param {String} fmCol Column in the feature metadata.
     * @return {Function} Takes as input a row of feature metadata (an Array),
     *                    and retrieves the "value" for fmCol from this row
     *                    (which may just mean returning a single element from
     *                    the row, or combining multiple columns' values) --
     *                    the behavior is dependent on fmCol.
     * @throws {Error} If fmCol is not present in this._featureMetadataColumns.
     */
    Empress.prototype._getFMValRetrievalFunction = function (fmCol) {
        var getValFromFM;
        var taxIdx = _.indexOf(this._splitTaxonomyColumns, fmCol);
        var fmIdx = _.indexOf(this._featureMetadataColumns, fmCol);
        if (fmIdx < 0) {
            throw 'Feature metadata column "' + cat + '" not present in data.';
        }
        if (taxIdx <= 0) {
            // If this feature metadata column is not in the "split taxonomy
            // columns" (i.e. taxIdx is -1), or if this feature metadata column
            // corresponds to the highest (and therefore first) taxonomy level
            // (e.g. "Kingdom" -- in this case taxIdx will be 0), then, when
            // extracting feature metadata from a given row, we can just get
            // this column's single value in that row.
            return function (fmRow) {
                return fmRow[fmIdx];
            };
        } else {
            // If this feature metadata column corresponds to a taxonomy level
            // below the highest one (e.g. phylum, or class, ...) then we want
            // to handle it specially -- see #473 on GitHub. We'll do this by
            // recording all the "indices" of the feature metadata columns
            // corresponding to the ancestors above this feature metadata
            // column (and then this column itself). This makes it easier to
            // identify all the ancestral information for a given taxonomy
            // entry.
            var ancestorFMIndices = [];
            // We can use a basic for loop starting at 0 because
            // this._splitTaxonomyColumns are in order
            for (var i = 0; i < taxIdx; i++) {
                var currTaxCol = this._splitTaxonomyColumns[i];
                var currTaxColFMIdx = _.indexOf(
                    this._featureMetadataColumns,
                    currTaxCol
                );
                ancestorFMIndices.push(currTaxColFMIdx);
            }
            // We already know the index of the column we end at, so just put
            // it here at the end manually. (Saving this extra work probably
            // won't make an appreciable time difference, but it feels nice :)
            ancestorFMIndices.push(fmIdx);
            return function (fmRow) {
                var totalFMVal = "";
                _.each(ancestorFMIndices, function (ancestorFMIdx, ii) {
                    // Separate adjacent levels in the resulting f.m. value
                    // shown: e.g. "k__Bacteria; p__Cyanobacteria"
                    if (ii > 0) {
                        totalFMVal += "; ";
                    }
                    totalFMVal += fmRow[ancestorFMIdx];
                });
                return totalFMVal;
            };
        }
    };

    /**
     * Retrieve unique value information for a feature metadata field.
     *
     * @param {String} cat The feature metadata column to find information for.
     * @param {String} method Defines what feature metadata to check.
     *                        If this is "tip", then only tip-level feature
     *                        metadata will be used. If this is "all", then
     *                        this will use both tip and internal node feature
     *                        metadata. If this is anything else, this will
     *                        throw an error.
     * @return {Object} An object with two keys:
     *                  -sortedUniqueValues: maps to an Array of the unique
     *                   values in this feature metadata field, sorted using
     *                   util.naturalSort().
     *                  -uniqueValueToFeatures: maps to an Object which maps
     *                   the unique values in this feature metadata column to
     *                   an array of the node name(s) with each value.
     * @throws {Error} If any of the following conditions are met:
     *                 -If cat is not present in this._featureMetadataColumns
     *                 -If method is not "tip" or "all"
     */
    Empress.prototype.getUniqueFeatureMetadataInfo = function (cat, method) {
        // get nodes in tree
        var nodes = new Set([...this._tree.postorderTraversal()]);

        // In order to access feature metadata for a given node, we need to
        // find the 0-based index in this._featureMetadataColumns that the
        // specified f.m. column corresponds to. (We *could* get around this by
        // generating a mapping of f.m. column name -> index in Python, but I
        // don't expect that f.m. columns will be very large and this is only
        // done once per coloring operation so this shouldn't be a bottleneck.)
        var fmIdx = _.indexOf(this._featureMetadataColumns, cat);
        if (fmIdx < 0) {
            throw 'Feature metadata column "' + cat + '" not present in data.';
        }

        // The coloring method influences how much of the feature metadata
        // we'll look at. (While we're at it, validate the coloring method.)
        var fmObjs;
        if (method === "tip") {
            fmObjs = [this._tipMetadata];
        } else if (method === "all") {
            fmObjs = [this._tipMetadata, this._intMetadata];
        } else {
            throw 'F. metadata coloring method "' + method + '" unrecognized.';
        }

        // Define how we're going to extract feature metadata for a given "row"
        // (i.e. for each entry in the feature metadata).
        var getValFromFM = this._getFMValRetrievalFunction(cat);

        // Produce a mapping of unique values in this feature metadata
        // column to an array of the node name(s) with each value.
        var uniqueValueToFeatures = {};
        _.each(fmObjs, function (mObj) {
            _.mapObject(mObj, function (fmRow, node) {
                var fmVal = getValFromFM(fmRow);
                if (!_.has(uniqueValueToFeatures, fmVal)) {
                    uniqueValueToFeatures[fmVal] = [];
                }

                // need to convert to integer
                node = parseInt(node);

                // ignore nodes that have been sheared
                if (!nodes.has(node)) {
                    return;
                }
                uniqueValueToFeatures[fmVal].push(node);
            });
        });

        var sortedUniqueValues = util.naturalSort(
            Object.keys(uniqueValueToFeatures)
        );
        return {
            sortedUniqueValues: sortedUniqueValues,
            uniqueValueToFeatures: uniqueValueToFeatures,
        };
    };

    /**
     * Color the tree based on a feature metadata column.
     *
     * @param {String} cat The feature metadata column to color nodes by.
     *                     This must be present in this._featureMetadataColumns
     *                     or an error will be thrown.
     * @param {String} color The name of the color map to use.
     * @param {String} method Defines how coloring is done. If this is "tip",
     *                        then only tip-level feature metadata will be
     *                        used, and (similar to sample coloring) upwards
     *                        propagation of unique values will be done in
     *                        order to color internal nodes where applicable.
     *                        If this is "all", then this will use both tip and
     *                        internal node feature metadata without doing any
     *                        propagation. If this is anything else, this will
     *                        throw an error.
     * @param{Boolean} reverse Defaults to false. If true, the color scale
     *                         will be reversed, with respect to its default
     *                         orientation.
     *
     * @return {Object} Maps unique values in this f. metadata column to colors
     */
    Empress.prototype.colorByFeatureMetadata = function (
        cat,
        color,
        method,
        reverse = false
    ) {
        var fmInfo = this.getUniqueFeatureMetadataInfo(cat, method);
        var sortedUniqueValues = fmInfo.sortedUniqueValues;
        var uniqueValueToFeatures = fmInfo.uniqueValueToFeatures;
        // convert observation IDs to _treeData keys. Notably, this includes
        // converting the values of uniqueValueToFeatures from Arrays to Sets.
        var obs = {};
        _.each(sortedUniqueValues, function (uniqueVal, i) {
            uniqueVal = sortedUniqueValues[i];
            obs[uniqueVal] = new Set(uniqueValueToFeatures[uniqueVal]);
        });

        // assign colors to unique values
        var colorer = new Colorer(
            color,
            sortedUniqueValues,
            undefined,
            undefined,
            reverse
        );

        // colors for drawing the tree
        var cm = colorer.getMapRGB();

        // colors for the legend
        var keyInfo = colorer.getMapHex();

        // if the tree has been sheared then categories in obs maybe empty.
        // getUniqueFeatureMetadataInfo() does not filter out those categories
        // so that the same color can be assigned to each value in obs.
        for (var key in keyInfo) {
            if (uniqueValueToFeatures[key].length === 0) {
                delete keyInfo[key];
            }
        }
        // Do upwards propagation only if the coloring method is "tip"
        if (method === "tip") {
            obs = this._projectObservations(obs, false);
        }

        // assigns nodes in to a group in this._group array
        this.assignGroups(obs);

        // color tree
        this._colorTree(obs, cm);

        this.updateLegendCategorical(cat, keyInfo);

        return keyInfo;
    };

    /*
     * Projects the groups in obs up the tree.
     *
     * This function performs two distinct operations:
     *      1) Removes the non-unique observations from each group in obs
     *         (i.e. performs an 'exclusive or' between each group).
     *
     *      2) Assigns each internal node to a group if all of its children belong
     *         to the same group.
     *@t
     *      3) Remove empty groups from return object.
     *
     * Note: All tips that are not passed into obs are considered to belong to
     *       a "not-represented" group, which will be omitted from the
     *       returned version of obs.
     *
     * @param {Object} obs Maps categories to a set of observations (i.e. tips)
     * @param {Bool} ignoreAbsentTips Whether absent tips should be ignored
     *                                during color propagation.
     *
     * @return {Object} returns A Map with the same group names that maps groups
                        to a set of keys (i.e. tree nodes) that are unique to
                        each group.
     */
    Empress.prototype._projectObservations = function (obs, ignoreAbsentTips) {
        var tree = this._tree,
            nodeValue = [],
            node,
            category;
        // set values for each node in obs
        for (category in obs) {
            for (node of obs[category]) {
                if (nodeValue[node] === undefined) {
                    nodeValue[node] = category;
                } else {
                    nodeValue[node] = null;
                }
            }
        }

        for (node of this._tree.postorderTraversal()) {
            var parent = tree.postorder(
                tree.parent(tree.postorderselect(node))
            );
            if (nodeValue[node] === undefined && ignoreAbsentTips) {
                continue;
            }

            if (
                nodeValue[parent] === undefined &&
                nodeValue[node] !== undefined
            ) {
                nodeValue[parent] = nodeValue[node];
            } else if (
                nodeValue[parent] !== nodeValue[node] ||
                nodeValue[node] === undefined
            ) {
                nodeValue[parent] = null;
            }
        }

        var result = {};
        for (node of this._tree.postorderTraversal(true)) {
            category = nodeValue[node];
            if (category !== null && category !== undefined) {
                if (result.hasOwnProperty(category)) {
                    result[category].add(node);
                } else {
                    result[category] = new Set([node]);
                }
            }
        }

        // remove all groups that do not contain unique features
        result = _.pick(result, function (value, key) {
            return value.size > 0;
        });

        return result;
    };

    /**
     * Updates the tree based on obs and cm but does not draw a new tree.
     *
     * NOTE: The nodes in each category should be unique. The behavior of
     *       this function is undefined if nodes in each category are not
     *       unique.
     *
     * @param{Object} obs Maps categories to the unique nodes to be colored for
     *                    each category.
     * @param{Object} cm Maps categories to the colors to color their nodes
     *                   with. Colors should be represented as RGB number, for
     *                   example as is done in the color values of the output
     *                   of Colorer.getMapRGB().
     */
    Empress.prototype._colorTree = function (obs, cm) {
        var categories = util.naturalSort(Object.keys(obs));
        // color tree
        for (var i = 0; i < categories.length; i++) {
            category = categories[i];
            var keys = [...obs[category]];

            for (var j = 0; j < keys.length; j++) {
                var node = keys[j];
                this.setNodeInfo(node, "color", cm[category]);
                this.setNodeInfo(node, "isColored", true);
            }
        }
    };

    /**
     * Sets the color of the tree back to default
     */
    Empress.prototype.resetTree = function () {
        for (var node = 1; node <= this._tree.size; node++) {
            this.setNodeInfo(node, "color", this.DEFAULT_COLOR);
            this.setNodeInfo(node, "isColored", false);
            this.setNodeInfo(node, "visible", true);
        }
        this._dontCollapse = new Set();
        this._collapsedCladeBuffer = [];
        this._drawer.loadThickNodeBuff([]);
        this._drawer.loadCladeBuff([]);
        this._group = new Array(this._tree.size + 1).fill(-1);

        // if _collapsedClades is empty then there is no need to call
        // getTreeCoords which can save a fair amount of time depending on the
        // size of the tree
        if (Object.keys(this._collapsedClades).length > 0) {
            this._drawer.loadTreeCoordsBuff(this.getTreeCoords());
        }
        this._collapsedClades = {};
    };

    /**
     * Clears the legend.
     */
    Empress.prototype.clearLegend = function () {
        this._legend.clear();
    };

    /**
     * Set the #legend-main width and height back to their defaults.
     *
     * This allows the legend to be resized back to whatever the default
     * size will be, since manually resizing the legend sets a fixed
     * width/height value.
     */
    Empress.prototype.resizeLegend = function () {
        // Setting CSS properties to "" causes the default values to be used:
        // see https://stackoverflow.com/a/21457941.
        document.getElementById("legend-main").style.width = "";
        document.getElementById("legend-main").style.height = "";
    };

    /**
     * Updates the legend based on a categorical color key.
     *
     * This is set up as a public method so that the Animator can update the
     * legend on its own (without having to reference this._legend from outside
     * of Empress).
     *
     * @param {String} name Text to show in the legend title.
     * @param {Object} keyInfo Color key information. Maps unique values (e.g.
     *                         in sample or feature metadata) to their assigned
     *                         color, expressed in hex format.
     */
    Empress.prototype.updateLegendCategorical = function (name, keyInfo) {
        this.resizeLegend();
        this._legend.addCategoricalKey(name, keyInfo);
    };

    /**
     * Returns a list of sample categories.
     *
     * If this.isCommunityPlot is false (no table / sample metadata were
     * provided), this just returns [].
     *
     * @return {Array}
     */
    Empress.prototype.getSampleCategories = function () {
        if (this.isCommunityPlot) {
            return this._biom.getSampleCategories();
        } else {
            return [];
        }
    };

    /**
     * Returns a list of all available layouts.
     *
     * @return {Array}
     */
    Empress.prototype.getAvailableLayouts = function () {
        return Object.keys(this._layoutToCoordSuffix);
    };

    /**
     * Redraws the tree, using the current layout and any layout parameters
     * that may have changed in the interim.
     */
    Empress.prototype.reLayout = function () {
        this.getLayoutInfo();

        // recollapse clades
        if (Object.keys(this._collapsedClades).length != 0) {
            this._collapsedCladeBuffer = [];
            this.collapseClades();
        }

        // Adjust the thick-line stuff before calling drawTree() --
        // this will get the buffer set up before it's actually drawn
        // in drawTree(). Doing these calls out of order (draw tree,
        // then call thickenColoredNodes()) causes the thick-line
        // stuff to only change whenever the tree is redrawn.
        this.thickenColoredNodes(this._currentLineWidth);

        this.redrawBarPlotsToMatchLayout();
        this.centerLayoutAvgPoint();
    };

    /**
     * Redraw the barplot to match the current layout. If the current layout is
     * "Unrooted" then this will remove the barplots from canvas.
     *
     */
    Empress.prototype.redrawBarPlotsToMatchLayout = function () {
        // Undraw or redraw barplots as needed (assuming barplots are supported
        // in the first place, of course; if no feature or sample metadata at
        // all was passed then barplots are not available :()
        if (!_.isNull(this._barplotPanel)) {
            var supported = this._barplotPanel.updateLayoutAvailability(
                this._currentLayout
            );
            if (!supported && this._barplotsDrawn) {
                this.undrawBarplots();
            } else if (supported && this._barplotPanel.enabled) {
                this.drawBarplots();
            }
        }
    };

    /**
     * Redraws the tree with a new layout (if different from current layout).
     *
     * Note that this not always called when the tree is redrawn in a different
     * way; it's possible to change certain layout parameters (e.g. to ignore
     * branch lengths) and then call reLayout() without touching this method.
     * This is by design, since whether or not to ignore branch lengths is a
     * separate decision from what layout the tree is currently using.
     */
    Empress.prototype.updateLayout = function (newLayout) {
        if (this._currentLayout !== newLayout) {
            if (this._layoutToCoordSuffix.hasOwnProperty(newLayout)) {
                // get new layout
                this._currentLayout = newLayout;
                this.reLayout();
                // recenter viewing window
                // NOTE: this function calls drawTree(), which is redundant
                // since reLayout() already called it. Would be good to
                // minimize redundant calls to that.
            } else {
                // This should never happen under normal circumstances (the
                // input to this function should always be an existing layout
                // name), but we might as well account for it anyway.
                throw "Layout " + newLayout + " doesn't have coordinate data.";
            }
        }
    };

    /**
     * Returns the default layout name.
     *
     * @return {String}
     */
    Empress.prototype.getDefaultLayout = function () {
        return this._defaultLayout;
    };

    /**
     * Returns an array of unique values in a metadata column. If column is
     * numberic then the array is sorted in ascending order.
     *
     * @param{Object} category The column of data
     *
     * @return{Object}
     */
    Empress.prototype.getUniqueSampleValues = function (category) {
        return this._biom.getUniqueSampleValues(category);
    };

    /**
     * Returns a mapping of trajectory values to observations given a gradient
     * and trajectory. See BIOMTable.getGradientStep()'s docs for details.
     *
     * @param {String} gradCol Sample metadata column for the gradient
     * @param {String} gradVal Value within the gradient column to get
     *                         information for
     * @param {String} trajCol Sample metadata column for the trajectory
     *
     * @return {Object} Maps trajectory values to an array of feature IDs
     *
     * @throws {Error} If the gradient or trajectory columns are unrecognized.
     *                 If no samples' gradient column value is gradVal.
     */
    Empress.prototype.getGradientStep = function (gradCol, gradVal, trajCol) {
        return this._biom.getGradientStep(gradCol, gradVal, trajCol);
    };

    /**
     * Returns an array of feature metadata column names.
     *
     * @return {Array}
     */
    Empress.prototype.getFeatureMetadataCategories = function () {
        return this._featureMetadataColumns;
    };

    /**
     * Display the tree nodes.
     *
     * @param{String} showTreeNodes 0 - draw only internal nodes circles,
     *                              1 - draw all node circles,
     *                              2 - hide all node circles,
     *                              3 - draw node only 1 descendant
     */
    Empress.prototype.setTreeNodeVisibility = function (showTreeNodes) {
        this.drawNodeCircles = Number(showTreeNodes);
        this.drawTree();
    };

    /**
     * Centers the viewing window at the average of the current layout.
     *
     * The layout's average point is defined as [x, y, zoomAmount], where:
     *
     * -x is the average of all x coordinates
     * -y is the average of all y coordinates
     * -zoomAmount takes the largest x or y coordinate and normalizes it by
     *  dim / 2 (where dim is the dimension of the canvas).
     *
     * zoomAmount is defined be a simple heuristic that should allow the
     * majority of the tree to be visible in the viewing window.
     *
     * NOTE: Previously, layoutAvgPoint was cached for each layout. This
     * behavior has been removed, because (with the advent of leaf sorting and
     * "ignore lengths") a given "layout" (e.g. Rectangular) can now have
     * pretty drastically different locations across all the options available.
     *
     * @return {Array} Contains three elements, in the following order:
     *                 1. Average x-coordinate
     *                 2. Average y-coordinate
     *                 3. zoomAmount
     *                 As of writing, nothing in Empress that I'm aware of
     *                 consumes the output of this function. The main reason we
     *                 return this is to make testing this easier.
     */
    Empress.prototype.centerLayoutAvgPoint = function () {
        var layoutAvgPoint = [];
        // Add up x and y coordinates of all nodes in the tree (using
        // current layout).
        var x = 0,
            y = 0,
            zoomAmount = 0;
        for (var node of this._tree.postorderTraversal((includeRoot = true))) {
            // node = this._treeData[node];
            x += this.getX(node);
            y += this.getY(node);
            zoomAmount = Math.max(
                zoomAmount,
                Math.abs(this.getX(node)),
                Math.abs(this.getY(node))
            );
        }

        layoutAvgPoint = [
            x / this._tree.size,
            y / this._tree.size,
            (2 * zoomAmount) / this._drawer.dim,
        ];

        // center the viewing window on the average point of the current layout
        // and zoom out so the majority of the tree is visible.
        var cX = layoutAvgPoint[0],
            cY = layoutAvgPoint[1];
        this._drawer.centerCameraOn(cX, cY);
        this._drawer.zoom(
            this._drawer.treeSpaceCenterX,
            this._drawer.treeSpaceCenterY,
            false,
            layoutAvgPoint[2]
        );
        this.drawTree();
        return layoutAvgPoint;
    };

    /**
     * Set a callback when a the node menu is shown on screen
     *
     * The callback will receive an array of samples as the only argument. This
     * is intended to be used with Emperor.
     *
     * @param {Function} callback Callback to execute.
     */
    Empress.prototype.setOnNodeMenuVisibleCallback = function (callback) {
        this._events.selectedNodeMenu.visibleCallback = callback;
    };

    /**
     * Set a callback when the node menu is removed from the screen
     *
     * The callback will receive an array of samples as the only argument. This
     * is intended to be used with Emperor.
     *
     * @param {Function} callback Callback to execute.
     */
    Empress.prototype.setOnNodeMenuHiddenCallback = function (callback) {
        this._events.selectedNodeMenu.hiddenCallback = callback;
    };

    /**
     * Sets the group state value for all tree nodes. Assigns all nodes in obs
     * to their repsect group. All other nodes will be set to the null group.
     *
     * Note: this will effect this._groups
     *
     * @param {Object} obs An object whose keys are group values and elements
     *                     are the nodes that belong to that group.
     */
    Empress.prototype.assignGroups = function (obs) {
        var groupNum = 0;
        for (var cat in obs) {
            var nodes = [...obs[cat]];
            for (var i in nodes) {
                this._group[nodes[i]] = groupNum;
            }
            groupNum++;
        }
    };

    /**
     * Adds clade to the "do not collapse list"
     *
     * @param{Number/String} clade The postorder position of a node (clade).
     *                             This can either be an integer or a string.
     */
    Empress.prototype.dontCollapseClade = function (clade) {
        var scope = this;
        var nodes = this._tree.getCladeNodes(parseInt(clade));
        nodes.forEach(function (node) {
            scope._dontCollapse.add(node);
        });
        this._collapsedClades = {};
        // Note: currently collapseClades is the only method that set
        // the node visibility property.
        for (var i of this._tree.postorderTraversal((includeRoot = true))) {
            this.setNodeInfo(i, "visible", true);
        }

        this._collapsedCladeBuffer = [];
        this.collapseClades();
        this.drawTree();
    };
    /**
     * Collapses all clades that share the same color into a quadrilateral.
     *
     * NOTE: Previously, this checked this._collapsedClades to see if there
     * were any "cached" clades. I've removed this for now because it's
     * possible for the layout to stay the same but the clades still to
     * need updating (e.g. if the "ignore lengths" setting of Empress
     * changes). If collapsing clades is a bottleneck, we could try to add
     * back caching.
     *
     * @return{Boolean} true if at least one clade was collapse. false otherwise
     */
    Empress.prototype.collapseClades = function () {
        // The following algorithm consists of two parts: 1) find all clades
        // whose member nodes have the same color, 2) collapse the clades

        // 1) Find all clades
        // this._group array will be used to determine what color group a node
        // belongs to. At this point, this._group has been initialized by either
        // colorBySampleCat, colorByFeatureMetadata, or the animator. Each index
        // of this._group refers to a node's postorder position and the value at
        // that index refers to the group a node belongs to. The values of group
        // are in the range [-1, inf). -1 means the node either is
        // "non-represented" or "non-unique".

        // project groups up tree
        // Note: if _projectObservations was called, then if an internal node
        // belongs to a group, all of its descendants will belong to the
        // same group. However, this is not guaranteed if _projectOBservations
        // was not called. Thus, this loop is used to guarantee that if an
        // internal node belongs to a group then all of its descendants belong
        // to the same group.
        for (var i of this._tree.postorderTraversal()) {
            var parent = this._tree.postorder(
                this._tree.parent(this._tree.postorderselect(i))
            );
            if (this._group[i] !== this._group[parent]) {
                this._group[parent] = -1;
            }
        }

        // 2) Collapse the clades
        // To accomplish this, we will iterate the tree in a inorder fashion.
        // Once a internal node is reached that belongs to a group (i.e. not -1)
        // than that node will be marked as the root of the clade and then
        // collaped.
        // Collapsing a clade will set the .visible property of members to
        // false and will then be skipped in the for loop.
        for (var node of this._tree.inOrderTraversal()) {
            // dont collapse clade
            if (this._dontCollapse.has(node)) {
                continue;
            }
            var visible = this.getNodeInfo(node, "visible");
            var isTip = this._tree.isleaf(this._tree.postorderselect(node));

            if (visible && !isTip && this._group[node] !== -1) {
                if (this._tree.getNumTips(node) > 1) {
                    this._collapseClade(node);
                } else {
                    this._dontCollapse.add(node);
                }
            }
        }
        this._drawer.loadTreeCoordsBuff(this.getTreeCoords());
    };

    /**
     * Creates a special shape for WebGl to draw in place of a clade. Each
     * layout has its own unique shape. Furthermore, Rectangular and Circular
     * layuots will get two versions of their shape. The shape that will be
     * drawn will be determined by this._currentLayout and this._collapseMethod.
     * Before calling this method, the .visible property of all nodes in the
     * clade (besides the root) should be set to false.
     *
     * Note: This method will modify this._collapsedCladeBuffer and also add
     *       sX, sY, and totalAngle to each clade in this_collapsedClades if
     *       this._currentLayou === "Circular"
     *
     * @param {Number} rootNode The root of the clade
     */
    Empress.prototype.createCollapsedCladeShape = function (rootNode) {
        // add collapsed clade to drawing buffer
        var cladeBuffer = [];
        var color = this._collapsedClades[rootNode].color;
        var cladeInfo = this._collapsedClades[rootNode];
        var scope = this;
        var curNode, x, y;

        // Note: "left" and "right" most children are different for each layout.
        //       Unrooted:
        //          left  - the left most child
        //          right - the right most child
        //      Rectangular:
        //          left  - the tip with smallest y-coord
        //          right - the tip with the largest y-coord
        //      Circular:
        //          left  - the tip with the smallest angle
        //          right - the tip with the largest angle
        var addPoint = function (point) {
            cladeBuffer.push(...point, color);
        };
        var getCoords = function (node) {
            return [scope.getX(node), scope.getY(node)];
        };
        if (this._currentLayout === "Unrooted") {
            // Unrooted collapsed clade is a quadrilateral whose vertices are
            // 1) root of clade, 2) "left" most node, 3) "right" most node, and
            // 4) deepest node. However, WebGl requires that we approximate the
            // quadrilateral with triangles. Thus, the quad is made out of two
            // triangles. One triangle is formed from 1, 4, 2 and the other
            // triangle from 1, 4, 3

            // input is either "left" most or "right" most child
            var addTriangle = function (child) {
                addPoint(getCoords(rootNode));
                addPoint(getCoords(cladeInfo.deepest));
                addPoint(getCoords(child));
            };

            // triangle from 1, 4, 2
            addTriangle(cladeInfo.left);

            // triangle from 1, 4, 3
            addTriangle(cladeInfo.right);
        } else if (this._currentLayout === "Rectangular") {
            // Rectangular layout is a triangle. Symmetric version is used if
            // this._collapseMethod === "symmetric"
            //
            // Unsymmetric version
            // The vertices of the triangle are 1) the root of the clade,
            // 2) "left" most child, 3) "right" most child
            //
            // Symmetric version
            // The vertices of the triangle are 1) the root of the clade,
            // 2) The "left" or "right" most child whose y-coordinate is closest
            // in value to the root, 3) The ray from the 1) to 2) will refected
            // across the horizontal axis that touches the root of the clade.

            // root of the clade
            addPoint(getCoords(rootNode));
            y = this.getY(rootNode);

            // The x coordinate of 2) and 3) will be set to the x-coordinate of
            // the "deepest" node.
            var dx = this.getX(cladeInfo.deepest);

            // y-coordinate of 2) and 3)
            var ly = this.getY(cladeInfo.left);
            var ry = this.getY(cladeInfo.right);
            if (this._collapseMethod === "symmetric") {
                if (Math.abs(y - ly) < Math.abs(y - ry)) {
                    ry = y + Math.abs(y - ly);
                } else {
                    ly = y - Math.abs(y - ry);
                }
            }
            addPoint([dx, ly]);
            addPoint([dx, ry]);
        } else {
            // Circular layout is a wedge. The wedge can be thought of a sector
            // of a circle whose center is at the root of the tree (note clade)
            // and whose radius is equal to the distance from the root of the
            // tree to the "deepest" node in the clade. The sector starts at the
            // root of the clade. Symmetric version is used if
            // this._collapseMethod === "symmetric"
            //
            // Note: The wedge is approximated by 15 triangles.
            //
            // Unsymmetric version
            // The angle of the sector is the angle between the "left" most and
            // "right" most children.
            //
            // Symmetric version
            // The angle of the sector is determined by taking the angle of the
            // "left" or "right" most child that is closest to the root of the
            // clade and doubling it.
            var dangle = this.getNodeInfo(cladeInfo.deepest, "angle");
            var langle = this.getNodeInfo(cladeInfo.left, "angle");
            var rangle = this.getNodeInfo(cladeInfo.right, "angle");
            var totalAngle, cos, sin, sX, sY;

            // This block finds (sX, sY) start point and total angle of the
            // sector
            x = this.getX(cladeInfo.deepest);
            y = this.getY(cladeInfo.deepest);
            if (this._collapseMethod === "symmetric") {
                var nangle = this.getNodeInfo(rootNode, "angle");
                var minAngle = Math.min(nangle - langle, rangle - nangle);
                totalAngle = 2 * minAngle;
                cos = Math.cos(nangle - minAngle - dangle);
                sin = Math.sin(nangle - minAngle - dangle);
                sX = x * cos - y * sin;
                sY = x * sin + y * cos;
            } else {
                totalAngle = rangle - langle;
                cos = Math.cos(langle - dangle);
                sin = Math.sin(langle - dangle);
                sX = x * cos - y * sin;
                sY =
                    x * Math.sin(langle - dangle) +
                    y * Math.cos(langle - dangle);
            }
            cladeInfo.sX = sX;
            cladeInfo.sY = sY;
            cladeInfo.totalAngle = totalAngle;

            // create triangles to approximate sector
            var numSamples = this._numSampToApproximate(totalAngle);
            var deltaAngle = totalAngle / numSamples;
            cos = 1; // Math.cos(0)
            sin = 0; // Math.sin(0)
            for (var line = 0; line < numSamples; line++) {
                addPoint(getCoords(rootNode));

                x = sX * cos - sY * sin;
                y = sX * sin + sY * cos;
                addPoint([x, y]);

                cos = Math.cos((line + 1) * deltaAngle);
                sin = Math.sin((line + 1) * deltaAngle);
                x = sX * cos - sY * sin;
                y = sX * sin + sY * cos;
                addPoint([x, y]);
            }
        }

        this._collapsedCladeBuffer.push(...cladeBuffer);
    };

    /**
     * Collapse the clade at rootNode
     *
     * This method will set the .visible property for all nodes in the clade
     * (except the root) to false. Also, this._collapsedCladeBuffer will be
     * updated.
     *
     * Note: This method will cache the clade information. So, as long as
     *       the collapsed clades aren't changed, you do not need to call this
     *       method again. Instead, just use createCollapsedCladeShape(). For
     *       example if the layout is switch, simply iterate through
     *       this._collapsedClades and call createCollapsedCladeShape() on each
     *       element.
     *
     * @param {Number} rootNode The root of the clade. Note: This is the key
     *                          in _treeData.
     */
    Empress.prototype._collapseClade = function (rootNode) {
        // There are four steps to collapse the clade. 1) find all nodes in the
        // clade, 2) find the "left", "right" and deepest node in the clade,
        // 3) set the .visible property of all nodes in the clade (except
        // rootNode) to false, 4) create the collapsed clade shape.
        // Note: "left" and "right" most children are different for each layout.
        //       Unrooted:
        //          left  - the left most child
        //          right - the right most child
        //      Rectangular:
        //          left  - the tip with smallest y-coord
        //          right - the tip with the largest y-coord
        //      Circular:
        //          left  - the tip with the smallest angle
        //          right - the tip with the largest angle

        // step 1: find all nodes in the clade.
        // Note: cladeNodes is an array of nodes arranged in postorder fashion
        var cladeNodes = this._tree.getCladeNodes(parseInt(rootNode));

        // use the left most child in the clade to initialize currentCladeInfo
        var currentCladeInfo = {
            left: cladeNodes[0],
            right: cladeNodes[0],
            deepest: cladeNodes[0],
            length: this._tree.getTotalLength(
                cladeNodes[0],
                rootNode,
                this.ignoreLengths
            ),
            color: this.getNodeInfo(rootNode, "color"),
        };

        // step 2: find the following clade information and
        // step 3: make all descendants of rootNode invisible
        for (var i in cladeNodes) {
            var cladeNode = cladeNodes[i];
            this.setNodeInfo(cladeNode, "visible", false);

            // internal nodes do not effect clade information
            if (!this._tree.isleaf(this._tree.postorderselect(cladeNode))) {
                continue;
            }

            var curLeft = currentCladeInfo.left;
            var curRight = currentCladeInfo.right;
            var curDeep = currentCladeInfo.deepest;
            var length = this._tree.getTotalLength(
                cladeNode,
                rootNode,
                this.ignoreLengths
            );

            // update deepest node
            if (length > currentCladeInfo.length) {
                currentCladeInfo.length = length;
                currentCladeInfo.deepest = cladeNode;
            }

            // update "left" and "right" most nodes
            if (this._currentLayout === "Unrooted") {
                // currentCladeInfo.left is initially set to be the "left" most
                // node in Unrooted layout so we only need to update "right".
                // Since cladeNodes arranges nodes in postorder, "right" is the
                // last tip in cladeNodes
                currentCladeInfo.right = cladeNode;
            } else if (this._currentLayout === "Rectangular") {
                curLeftY = this.getY(curLeft);
                curRightY = this.getY(curRight);
                y = this.getY(cladeNode);
                currentCladeInfo.left = y < curLeftY ? cladeNode : curLeft;
                currentCladeInfo.right = y > curRightY ? cladeNode : curRight;
            } else {
                curLAng = this.getNodeInfo(curLeft, "angle");
                curRAng = this.getNodeInfo(curRight, "angle");
                angle = this.getNodeInfo(cladeNode, "angle");
                currentCladeInfo.left = angle < curLAng ? cladeNode : curLeft;
                currentCladeInfo.right = angle > curRAng ? cladeNode : curRight;
            }
        }
        this._collapsedClades[rootNode] = currentCladeInfo;

        // the root of the clade should be visible
        this.setNodeInfo(rootNode, "visible", true);

        // step 4)
        this.createCollapsedCladeShape(rootNode);
    };

    /**
     * Update the collapse method. The collapse method can be changed to either
     * 'symmetric' or 'normal'.
     *
     * Note: this method will recreate the collapsed clades and call drawTree()
     *
     * @param{String} method The collapse method. An error will be thrown if
     *                       this is not either 'symmetric' or 'normal'
     */
    Empress.prototype.updateCollapseMethod = function (method) {
        // do nothing
        if (method === this._collapseMethod) {
            return;
        }

        if (method !== "normal" && method !== "symmetric") {
            throw method + " is not a clade collapse method.";
        }

        this._collapseMethod = method;
        this._collapsedCladeBuffer = [];
        for (var cladeRoot in this._collapsedClades) {
            this.createCollapsedCladeShape(cladeRoot);
        }
        this.drawTree();
    };

    /**
     * Checks if the point (x, y) is within the bounds of the collapsed clade.
     *
     * Note: if cladeRoot is not the root of a collapsed clade then this method
     *       will return false.
     *
     * @param {Number} cladeRoot The root of the clade. Note: cladeRoot should
     *                           be a key in this._treeData
     * @param {Array} point The x, y coordinate of the point
     *
     * @return {Boolean} true if point is within the bounds of the collapsed
     *                   clade, false otherwise
     */
    Empress.prototype._isPointInClade = function (cladeRoot, point) {
        // check if cladeRoot is the root of a collapsed clade
        if (!this._collapsedClades.hasOwnProperty(cladeRoot)) {
            return false;
        }

        var scope = this;
        var getCoords = function (node) {
            return [scope.getX(node), scope.getY(node)];
        };
        var clade = this._collapsedClades[cladeRoot];
        var cRoot = getCoords(cladeRoot);
        var left = getCoords(clade.left);
        var right = getCoords(clade.right);
        var deep = getCoords(clade.deepest);
        var cladeArea, netArea;
        if (this._currentLayout === "Unrooted") {
            // In Unrooted layout, to check if point is within in the collapsed
            // clade, we first calculate the area of the collapsed clade.
            // (The shape of the collapsed clade is a quad whose vertices are
            // (1) root, (2) "left" most child, (3) "right" most child, and
            // (4) "deepest" child). Next, we form four triangles whose vertices
            // are:
            // 1) point, (3), (4)
            // 2) point, (4), (2)
            // 3) point, (2), (1)
            // 4) point, (1), (3)
            // and sum there areas. Next, we take the difference of quad area
            // and triangle areas. If the difference is ~0, then point is in the
            // collapsed clade.
            // Note: this works because the only way for the difference in areas
            //       to be zero is if the triangles exactly overlap the
            //       collapsed clade.
            cladeArea =
                VectorOps.triangleArea(cRoot, left, right) +
                VectorOps.triangleArea(deep, left, right);

            // can happen if clade has children with 0-length or clade
            // only has a single child. If cladeArea is 0, then the area of the
            // four trianges will also be 0 regardless of the location of point
            // (this is because the quad is either a point or a line). So, with
            // out this check, if cladeArea is 0 then this funtion will always
            // return 0
            if (cladeArea == 0) {
                return false;
            }
            netArea =
                cladeArea -
                VectorOps.triangleArea(point, right, deep) -
                VectorOps.triangleArea(point, deep, left) -
                VectorOps.triangleArea(point, left, cRoot) -
                VectorOps.triangleArea(point, cRoot, right);
            return Math.abs(netArea) < 1.0e-5;
        } else if (this._currentLayout == "Rectangular") {
            // The procedure is pretty much the same as Unrooted layout.
            // However, since, the Rectangular layout has two different version,
            // we need to first calculate the three vertices of the collapsed
            // clade (denoted (1), (2), (3)). Then, similar to the Unrooted
            // layout, we calculate the area of the collapsed clade. Next,
            // we form three triangle whose vertices are:
            // 1) point, (2), (3)
            // 2) point, (3), (1)
            // 3) point, (1), (2)
            // and take the difference of the areas. If the difference is 0,
            // then the point is within the collapsed clade.

            // find vertices of clade
            if (this._collapseMethod === "symmetric") {
                if (
                    Math.abs(cRoot[1] - left[1]) < Math.abs(cRoot[1] - right[1])
                ) {
                    right[1] = cRoot[1] + Math.abs(cRoot[1] - left[1]);
                } else {
                    left[1] = cRoot[1] - Math.abs(cRoot[1] - right[1]);
                }
            }
            cladeArea = VectorOps.triangleArea(
                cRoot,
                [deep[0], left[1]],
                [deep[0], right[1]]
            );

            // can happen if clade has children with 0-length or clade
            // only has a single child
            if (cladeArea == 0) {
                return false;
            }
            netArea =
                cladeArea -
                VectorOps.triangleArea(
                    point,
                    [deep[0], right[1]],
                    [deep[0], left[1]]
                ) -
                VectorOps.triangleArea(point, [deep[0], left[1]], cRoot) -
                VectorOps.triangleArea(point, cRoot, [deep[0], right[1]]);
            return Math.abs(netArea) < 1.0e-5;
        } else {
            // For Circular layou, we "use" Polar coordinates to determine if
            // point is in the clade. The idea behind this method is to
            // calculate the angle of the "left" and "right" most children in
            // the clade (we consider the root of the clade to be thec origin)
            // and also calculate the distance from the root of the tree
            // to the "deepest" node in the clade. Then we calculate the angle
            // of point and its distance to the root of the tree. if the angle
            // of point is within the range of the "left" and "right" and its
            // distance is less than the distance to the "deepest" node then,
            // point is within the bounds of the collapsed clade.
            var totalAngle = clade.totalAngle;
            var cos = Math.cos(totalAngle);
            var sin = Math.sin(totalAngle);

            left = [clade.sX, clade.sY];
            right[0] = left[0] * cos - left[1] * sin;
            right[1] = left[0] * sin + left[1] * cos;
            var getAngleAndMagnitude = function (p) {
                var angle = VectorOps.getAngle([
                    p[0] - cRoot[0],
                    p[1] - cRoot[1],
                ]);
                var radian = Math.asin(angle.sin);
                if (angle.cos < 0) {
                    radian = Math.PI - radian;
                } else if (angle.sin < 0) {
                    radian = 2 * Math.PI + radian;
                }
                return {
                    radian: radian,
                    mag: VectorOps.magnitude(p),
                };
            };

            var leftPoint = getAngleAndMagnitude(left);
            var rightPoint = getAngleAndMagnitude(right);
            var p = getAngleAndMagnitude(point);
            if (leftPoint.radian > rightPoint.radian) {
                rightPoint.radian += 2 * Math.PI;
                if (leftPoint.radian > p.radian) {
                    p.radian += 2 * Math.PI;
                }
            }
            return (
                p.radian >= leftPoint.radian &&
                p.radian <= rightPoint.radian &&
                p.mag <= leftPoint.mag
            );
        }
    };

    /**
     * Checks if (x, y) is within the bounds of a collapsed clade
     *
     * @param {Array} point (x, y) coordinates of a point
     *
     * @return {Number} if point is in a collapsed clade then root of the
     *                  the collapse clade will be returned otherwise -1 is
     *                  returned.
     */
    Empress.prototype.getRootNodeForPointInClade = function (point) {
        for (var clade in this._collapsedClades) {
            if (this._isPointInClade(clade, point)) {
                var cladeNode = this._treeData[clade];
                return parseInt(clade);
            }
        }
        return -1;
    };

    /**
     * Returns the name of node
     *
     * @param {Number} node The node key in this._treeData. An error will be
     *                      thrown if it is not a key in this._treeData
     *
     * @return {String} The name of the node
     */
    Empress.prototype.getName = function (node) {
        if (!this._treeData.hasOwnProperty(node)) {
            throw node + " is not a key in _treeData";
        }
        return this.getNodeInfo(node, "name");
    };

    /*
     * Given a tip name and a list of sample metadata fields, computes the
     * sample presence information: the number of samples for each unique
     * value within each field that contain this tip.
     *
     * If the specified tip name is not present within the BIOM table (i.e. the
     * tree was not shorn just to tips in the table, and one of those
     * not-in-the-table tips was clicked on) then this will return null.
     *
     * @param {String} nodeName Name of the (tip) node for which to calculate
     *                          sample presence.
     * @param {Array} fields Metadata fields for which to calculate tip
     *                       sample presence.
     * @return {Object or null} ctData Maps metadata field names to another
     *                                 Object, which in turn maps unique
     *                                 metadata values to the number of samples
     *                                 with this metadata value in this field
     *                                 that contain the given tip.
     *                                 (Will just be null, instead, if the tip
     *                                 isn't present in the table.)
     */
    Empress.prototype.computeTipSamplePresence = function (nodeName, fields) {
        if (this._biom.hasFeatureID(nodeName)) {
            var ctData = {};
            for (var f = 0; f < fields.length; f++) {
                var field = fields[f];
                ctData[field] = this._biom.getObsCountsBy(field, nodeName);
            }
            return ctData;
        } else {
            return null;
        }
    };

    /**
     * Calculate the number of samples in which at least one tip of an internal
     * node appears for the unique values of a metadata field across a list of
     * metadata fields.
     *
     * @param {String} nodeKey Key of the (internal) node to calculate
     *                         sample presence for.
     * @param {Array} fields Metadata fields for which to calculate internal
     *                       node sample presence.
     * @return {Object} samplePresence A mapping with three entries:
     *                                 (1) fieldsMap Maps metadata field names
     *                                 to Object mapping unique metadata values
     *                                 to the number of samples with this
     *                                 metadata value in this field containing
     *                                 at least one tip in the subtree of the
     *                                 given nodeKey. If none of the descendant
     *                                 tips of this internal node are present
     *                                 in the table, this will just be null.
     *                                 (2) diff Array of descendant tip names
     *                                 not present as features in the table.
     *                                 (3) samples Array of samples represented
     *                                 by descendant tips present in the table.
     */
    Empress.prototype.computeIntSamplePresence = function (nodeKey, fields) {
        // Find the descendant tips of this internal node
        var tips = this._tree.findTips(nodeKey);

        // descendant tips that aren't features in the table
        var diff = this._biom.getObsIDsDifference(tips);

        // Handle the case where none of the descendant tips are present in the
        // table specially -- the main distinguishing thing here is we return
        // null for fieldsMap, which lets the caller know that they should just
        // show a warning instead of a table.
        if (tips.length === diff.length) {
            return {
                fieldsMap: null,
                diff: diff,
                samples: [],
            };
        }

        // descendant tips that _are_ features in the table
        var intersection = this._biom.getObsIDsIntersection(tips);
        // samples represented by the "intersection" tips above
        var samples = this._biom.getSamplesByObservations(intersection);

        // Initialize an Object that, for each field within fields, maps each
        // unique value in that field to a 0. These 0s will be updated in the
        // next loop based on sample presence information for this internal
        // node.
        // NOTE that we could skip this step if we didn't want to show 0s in
        // the table; see https://github.com/biocore/empress/issues/329.
        var fieldsMap = {};
        for (var i = 0; i < fields.length; i++) {
            field = fields[i];
            var possibleValues = this._biom.getUniqueSampleValues(field);
            for (var j = 0; j < possibleValues.length; j++) {
                var possibleValue = possibleValues[j];
                if (!(field in fieldsMap)) fieldsMap[field] = {};
                fieldsMap[field][possibleValue] = 0;
            }
        }

        // Iterate over the fields, calling getSampleValuesCount() to get the
        // sample presence information for the values within the fields
        for (var k = 0; k < fields.length; k++) {
            field = fields[k];

            var value2cts = this._biom.getSampleValuesCount(samples, field);
            var fieldValues = Object.keys(value2cts);
            for (var m = 0; m < fieldValues.length; m++) {
                fieldValue = fieldValues[m];
                fieldsMap[field][fieldValue] += value2cts[fieldValue];
            }
        }

        var samplePresence = {
            fieldsMap: fieldsMap,
            diff: diff,
            samples: samples,
        };
        return samplePresence;
    };

    /**
     * Show the node menu for a node name
     *
     * @param {String} nodeName The name of the node to show.
     */
    Empress.prototype.showNodeMenuForName = function (nodeName) {
        if (!this._tree.containsNode(nodeName)) {
            util.toastMsg(
                "The node '" + nodeName + "' is not present in the phylogeny"
            );
            return;
        }

        this._events.selectedNodeMenu.clearSelectedNode();
        this._events.placeNodeSelectionMenu(nodeName, this.focusOnSelectedNode);
    };

    /**
     * Returns an Object describing various tree-level statistics.
     *
     * @return {Object} Contains six keys:
     *                  -min: Minimum non-root node length
     *                  -max: Maximum non-root node length
     *                  -avg: Average non-root node length
     *                  -tipCt: Number of tips in the tree
     *                  -intCt: Number of internal nodes in the tree (incl.
     *                          root)
     *                  -allCt: Number of all nodes in the tree (incl. root)
     * @throws {Error} If the tree does not have length information, this will
     *                 be unable to call BPTree.getLengthStats() and will thus
     *                 fail.
     */
    Empress.prototype.getTreeStats = function () {
        // Compute node counts
        var allCt = this._tree.currentSize;
        var tipCt = this._tree.getNumTips(this._tree.size);
        var intCt = allCt - tipCt;
        // Get length statistics
        var lenStats = this._tree.getLengthStats();
        return {
            min: lenStats.min,
            max: lenStats.max,
            avg: lenStats.avg,
            tipCt: tipCt,
            intCt: intCt,
            allCt: allCt,
        };
    };

    /**
     * Returns the length corresponding to a node key, or null if the node key
     * corresponds to the root of the tree.
     *
     * (The reason for the null thing is that the root node's length is not
     * currently validated, so we don't want to show whatever the value
     * there is stored as internally to the user.)
     *
     * @param {Number} nodeKey Postorder position of a node in the tree.
     * @return {Number} The length of the node.
     */
    Empress.prototype.getNodeLength = function (nodeKey) {
        if (nodeKey === this._tree.size) {
            return null;
        } else {
            return this._tree.length(this._tree.postorderselect(nodeKey));
        }
    };

    /**
     * This will fill the autocomplete search bar with the names of the current
     * tree.
     */
    Empress.prototype.setAutoCompleteNames = function () {
        var nodeNames = this._tree.getAllNames();
        // Don't include nodes with the name null (i.e. nodes without a
        // specified name in the Newick file) in the auto-complete.
        nodeNames = nodeNames.filter((n) => n !== null);
        this._events.autocomplete(nodeNames);
    };

    /**
     * This will shear/unshear
     */
    Empress.prototype.shear = function (shearMap) {
        this._tree.unshear();
        var scope = this;
        var removeNodes = new Set();
        shearMap.forEach(function (values, cat) {
            var fmInfo = scope.getUniqueFeatureMetadataInfo(cat, "tip");
            var uniqueValueToFeatures = fmInfo.uniqueValueToFeatures;
            _.each(values, function (val) {
                var obs = uniqueValueToFeatures[val];
                for (var node of obs) {
                    removeNodes.add(node);
                }
            });
        });

        if (this.isCommunityPlot) {
            this._biom.setIngnoreNodes(removeNodes);
        }

        this._tree.shear(removeNodes);

        this.setAutoCompleteNames();

        this.getLayoutInfo();

        this.redrawBarPlotsToMatchLayout();
    };

    return Empress;
});
