define(["underscore", "util"], function (_, util) {
    function SelectedNodeMenu(empress, drawer) {
        this.empress = empress;
        this.drawer = drawer;

        // General elements
        this.box = document.getElementById("menu-box");
        this.nodeNameLabel = document.getElementById("menu-box-node-id");
        this.nodeNameWarning = document.getElementById(
            "menu-box-node-name-warning"
        );
        this.nodeLengthContainer = document.getElementById(
            "menu-box-node-length-container"
        );
        this.nodeLengthLabel = document.getElementById("menu-box-node-length");

        // Sample metadata elements
        this.smSection = document.getElementById("menu-sm-section");
        this.smHeader = document.getElementById("menu-sm-header");
        this.smTable = document.getElementById("menu-sm-table");
        this.sel = document.getElementById("menu-select");
        this.addBtn = document.getElementById("menu-add-btn");
        this.smAddSection = document.getElementById("menu-sm-add-section");
        this.smNotes = document.getElementById("menu-box-sm-notes");
        this.smNotInTableWarning = document.getElementById(
            "menu-box-node-not-in-table-warning"
        );

        // Feature metadata elements
        this.fmSection = document.getElementById("menu-fm-section");
        this.fmHeader = document.getElementById("menu-fm-header");
        this.fmNoDataNote = document.getElementById("menu-fm-no-fm-note");
        this.fmTable = document.getElementById("menu-fm-table");

        this.nodeKeys = null;
        this.fields = [];
        // Will be set to true when the user adds ALL sample metadata fields to
        // the table. Signifies to the class that we should never show the add
        // section again. See #272 on GitHub.
        this.smFieldsExhausted = false;
        this.fmCols = this.empress.getFeatureMetadataCategories();
        this.hasSampleMetadata = false;
        this.hasFeatureMetadata = false;
        this.hiddenCallback = null;
        this.visibleCallback = null;
        this._samplesInSelection = [];
        this.initialize();
    }

    /**
     * Un-hides a HTMLElement.
     *
     * @param {HTMLElement} ele
     */
    function show(ele) {
        ele.classList.remove("hidden");
    }

    /**
     * Sets the textContent of a HTMLElement and un-hides it.
     *
     * @param {HTMLElement} warningEle
     * @param {String} msg
     */
    function updateAndShow(ele, msg) {
        ele.textContent = msg;
        show(ele);
    }

    /**
     * Hides a HTMLElement.
     *
     * @param {HTMLElement} ele
     */
    function hide(ele) {
        ele.classList.add("hidden");
    }

    /**
     * Initializes the state machine. Adds metadata field options to drop down
     * menu, and creates the add button click event.
     */
    SelectedNodeMenu.prototype.initialize = function () {
        var scope = this;

        this.hasSampleMetadata = this.empress.isCommunityPlot;
        if (this.hasSampleMetadata) {
            // add items to select
            var selOpts = this.empress.getSampleCategories();
            for (var i = 0; i < selOpts.length; i++) {
                var opt = document.createElement("option");
                opt.value = selOpts[i];
                opt.innerHTML = selOpts[i];
                this.sel.appendChild(opt);
            }
            // add event to add button
            var click = function () {
                var val = scope.sel.value;
                scope.sel.options[scope.sel.selectedIndex].remove();
                // Hide the add button and related elements when all fields
                // are added: https://github.com/biocore/empress/issues/272
                if (scope.sel.options.length === 0) {
                    hide(scope.smAddSection);
                    scope.smFieldsExhausted = true;
                }
                scope.fields.push(val);
                show(scope.smHeader);
                scope.showNodeMenu();
            };
            this.addBtn.onclick = click;
            show(this.smSection);
        } else {
            hide(this.smSection);
        }

        this.hasFeatureMetadata = this.fmCols.length > 0;
        if (this.hasFeatureMetadata) {
            show(this.fmSection);
        } else {
            hide(this.fmSection);
        }
    };

    /*
     * Creates a HTML table describing sample presence info for a feature.
     *
     * @param{Object} ctData Two-dimensional mapping: The keys are the
     *                       sample metadata fields to include in the table,
     *                       and the values are Objects mapping unique values
     *                       in these fields to numbers describing this
     *                       feature's presence for these values.
     *                       e.g. {"body-site": {"gut": 5, "tongue": 2}}
     * @param{String} tipOrInt "tip" If showing data for a tip, "int" if
     *                         showing data for an internal node. The behavior
     *                         for other values is undefined.
     * @param {Number} diffLen If this is > 0, and if tipOrInt is "int",
     *                         this will add an extra sentence to the text
     *                         shown for the notes accompanying the sample
     *                         metadata table about how this many tips
     *                         descending from an internal node are missing
     *                         from the feature table.
     * @param {Number} descTipCt The total number of tips descending from an
     *                           internal node. Will be used in the diffLen
     *                           message described above.
     */
    SelectedNodeMenu.prototype.makeSampleMetadataTable = function (
        ctData,
        tipOrInt,
        diffLen = 0,
        descTipCt = 0
    ) {
        if (this.hasSampleMetadata) {
            this.smTable.innerHTML = "";
            if (_.isNull(ctData)) {
                // This node (or its descendant tips) isn't present in the
                // table. Just show some text explaining the situation, and
                // hide the table.
                var wtext;
                if (tipOrInt === "tip") {
                    wtext =
                        "This is a tip in the tree. However, it is not " +
                        "present in the input feature table, so we " +
                        "can't show sample presence information for it.";
                } else {
                    wtext =
                        "This is an internal node in the tree. None of " +
                        "its descendant tips are present in the input " +
                        "feature table, so we can't show sample presence " +
                        "information for it.";
                }
                updateAndShow(this.smNotInTableWarning, wtext);
                hide(this.smTable);
                hide(this.smNotes);
                hide(this.smAddSection);
            } else {
                if (this.fields.length > 0) {
                    // loop over all metadata fields the user has decided to show
                    var sortedFields = util.naturalSort(_.keys(ctData));
                    for (var i = 0; i < sortedFields.length; i++) {
                        var field = sortedFields[i];

                        // Create new rows in menu-table: the first row is for
                        // this metadata field's "headers" (the unique values
                        // in the field, e.g. "gut", "tongue", etc. for a field
                        // like body site), and the second row is for the
                        // sample presence data for the selected tip(s)
                        // for these unique values.
                        //
                        // Each group of two rows additionally has a header cell
                        // on its leftmost side which spans both the header and
                        // data rows; this header cell contains the name of the
                        // selected metadata field, and has some fancy CSS that
                        // keeps it frozen in place as the user scrolls the
                        // table horizontally.
                        var fieldHeaderRow = this.smTable.insertRow(-1);
                        var fieldHeaderCell = fieldHeaderRow.insertCell(-1);
                        fieldHeaderCell.innerHTML =
                            "<strong>" + field + "</strong>";
                        fieldHeaderCell.rowSpan = 2;
                        fieldHeaderCell.classList.add("menu-box-header-cell");
                        fieldHeaderCell.classList.add("frozen-cell");

                        var fieldDataRow = this.smTable.insertRow(-1);

                        // add row values for this metadata field, one column
                        // at a time
                        var categories = util.naturalSort(
                            _.keys(ctData[field])
                        );
                        for (var j = 0; j < categories.length; j++) {
                            var categoryHeaderCell = fieldHeaderRow.insertCell(
                                -1
                            );
                            categoryHeaderCell.innerHTML =
                                "<strong>" + categories[j] + "</strong>";
                            var categoryDataCell = fieldDataRow.insertCell(-1);
                            categoryDataCell.innerHTML =
                                ctData[field][categories[j]];
                        }
                    }
                    var ntext;
                    if (tipOrInt === "tip") {
                        ntext =
                            "This is a tip in the tree. These values " +
                            "represent the number of unique samples that " +
                            "contain this node.";
                    } else {
                        ntext =
                            "This is an internal node in the tree. " +
                            "These values represent the number of unique " +
                            "samples that contain any of this node's " +
                            "descendant tips.";
                    }
                    updateAndShow(this.smNotes, ntext);
                    show(this.smTable);
                    if (!this.smFieldsExhausted) {
                        show(this.smAddSection);
                    }
                } else {
                    hide(this.smTable);
                    updateAndShow(
                        this.smNotes,
                        "No sample metadata columns selected yet."
                    );
                    show(this.smAddSection);
                }
                if (tipOrInt === "int" && diffLen > 0) {
                    updateAndShow(
                        this.smNotInTableWarning,
                        "Warning: " +
                            diffLen +
                            " / " +
                            descTipCt +
                            " descendant tips from this node are not " +
                            "present within the feature table."
                    );
                    show(this.smNotInTableWarning);
                } else {
                    hide(this.smNotInTableWarning);
                }
            }
        } else {
            throw new Error(
                "Can't show a sample metadata table if no s.m. is available"
            );
        }
    };

    /*
     * Creates a HTML table (and a header) describing feature metadata.
     *
     * This checks to make sure that there actually is feature metadata (and
     * that the requested node has feature metadata) before creating things --
     * unlike makeSampleMetadataTable(), it's expected that some nodes may not
     * have any feature metadata information, or that feature metadata may not
     * have even been provided in the first place. (If this is the case, this
     * function will hide the fmHeader and fmTable elements.)
     *
     * @param{String} nodeName Name of the node to create this table for.
     *                         Duplicate names (for internal nodes) are ok.
     * @param{String} tipOrInt "tip" to query tip metadata, "int" to query
     *                         internal node metadata. Other values will cause
     *                         an error.
     */
    SelectedNodeMenu.prototype.makeFeatureMetadataTable = function (
        nodeName,
        tipOrInt
    ) {
        if (this.hasFeatureMetadata) {
            this.fmTable.innerHTML = "";
            var mdObj;
            if (tipOrInt === "tip") {
                mdObj = this.empress._tipMetadata;
            } else if (tipOrInt === "int") {
                mdObj = this.empress._intMetadata;
            } else {
                throw new Error("Invalid tipOrInt value: " + tipOrInt);
            }
            if (_.has(mdObj, nodeName)) {
                var headerRow = this.fmTable.insertRow(-1);
                var featureRow = this.fmTable.insertRow(-1);
                for (var x = 0; x < this.fmCols.length; x++) {
                    var colName = this.fmCols[x];
                    var colCell = headerRow.insertCell(-1);
                    colCell.innerHTML = "<strong>" + colName + "</strong>";
                    var dataCell = featureRow.insertCell(-1);
                    dataCell.innerHTML = mdObj[nodeName][x];
                }
                show(this.fmTable);
                hide(this.fmNoDataNote);
            } else {
                this.fmNoDataNote.textContent =
                    "This node does not have associated feature metadata.";
                hide(this.fmTable);
                show(this.fmNoDataNote);
            }
        } else {
            throw new Error(
                "Can't show a feature metadata table if no f.m. is available"
            );
        }
    };

    /**
     * Displays the node selection menu. nodeKeys must be set in order to use
     * this method.
     */
    SelectedNodeMenu.prototype.showNodeMenu = function () {
        // make sure the state machine is set
        if (this.nodeKeys === null) {
            throw "showNodeMenu(): Nodes have not been selected.";
        }

        // grab the name of the node
        var emp = this.empress;
        var nodeKeys = this.nodeKeys;
        var node = nodeKeys[0];
        var name = emp.getNodeInfo(node, "name");

        if (name === null) {
            this.nodeNameLabel.textContent = "Unnamed node";
        } else {
            this.nodeNameLabel.textContent = "Name: " + name;
        }
        hide(this.nodeNameWarning);
        // show either leaf or internal node
        var t = emp._tree;
        if (t.isleaf(t.postorderselect(this.nodeKeys[0]))) {
            this.showLeafNode();
        } else {
            this.showInternalNode();
        }

        // place menu-node menu next to the selected node
        // (if multiple nodes are selected, updateMenuPosition() positions the
        // menu next to an arbitrary one)
        this.updateMenuPosition();

        show(this.box);

        // Trigger Emperor callback if possible -- show the samples the
        // selected node, or its children, are present within.
        // (If multiple node keys are given, then this._samplesInSelection will
        // be set to [] since it isn't clear how to map multiple internal nodes
        // to samples.)
        if (this.visibleCallback !== null) {
            this.visibleCallback(this._samplesInSelection);
        }
    };

    /**
     * Creates the node menu-table for a tip node. nodeKeys must be set in
     * before this function is called.
     */
    SelectedNodeMenu.prototype.showLeafNode = function () {
        // test to make sure nodeKeys is set
        if (this.nodeKeys === null) {
            throw "showLeafNode(): nodeKeys is not set!";
        }

        // test to make sure the leaf node is unique
        // (This should already be enforced in the Python side of things, but
        // we may as well be extra cautious.)
        if (this.nodeKeys.length > 1) {
            throw "showLeafNode(): Leaf nodes must be unique!";
        }

        // get the name of the tip
        var node = this.nodeKeys[0];

        // 1. Add feature metadata information (if present for this tip; if
        // there isn't feature metadata for this tip, the f.m. table will be
        // hidden)
        if (this.hasFeatureMetadata) {
            this.makeFeatureMetadataTable(node, "tip");
        }

        this.setNodeLengthLabel(node);

        // 2. Add sample presence information for this tip (only if this data
        // is available in the first place, and if the user has selected at
        // least one field to show sample presence information for)
        if (this.hasSampleMetadata) {
            var ctData = this.empress.computeTipSamplePresence(
                node,
                this.fields
            );
            this.makeSampleMetadataTable(ctData, "tip");
            // 2.1 The samples represented by this tip are sent to Emperor.
            if (this.empress._biom.hasFeatureID(node)) {
                this._samplesInSelection = this.empress._biom.getSamplesByObservations(
                    [node]
                );
            } else {
                this._samplesInSelection = [];
            }
        }
    };

    /**
     * Creates the node menu-table for internal nodes. nodeKeys must be set in
     * before this function is called. Furthermore, if there are more than key
     * in nodeKeys, then the keys must represent internal nodes with the same
     * name in the newick tree.
     */
    SelectedNodeMenu.prototype.showInternalNode = function () {
        // test to make sure nodeKeys is set
        if (this.nodeKeys === null) {
            throw "showInternalNode(): nodeKeys is not set!";
        }

        var name = this.empress.getNodeInfo(this.nodeKeys[0], "name");
        // Figure out whether or not we know the actual node in the tree (for
        // example, if the user searched for a node with a duplicate name, then
        // we don't know which node the user was referring to). This impacts
        // whether or not we show the sample presence info for this node.
        var isUnambiguous = this.nodeKeys.length === 1;

        // This is not necessarily equal to this.nodeKeys. If an internal node
        // with a duplicate name was clicked on then this.nodeKeys will only
        // have a single entry (the node that was clicked on): but
        // keysOfNodesWithThisName will accordingly have multiple entries.
        // The reason we try to figure this out here is so that we can
        // determine whether or not to show a warning about duplicate names
        // in the menu.
        if (name !== null) {
            var keysOfNodesWithThisName = this.empress._tree.getNodesWithName(
                name
            );
            if (keysOfNodesWithThisName.length > 1) {
                updateAndShow(
                    this.nodeNameWarning,
                    "Warning: " +
                        keysOfNodesWithThisName.length +
                        " nodes exist with the above name."
                );
            }
        } else {
            updateAndShow(
                this.nodeNameWarning,
                "No name was provided for this node in the input tree file."
            );
        }

        // 1. Add feature metadata information (if present) for this node.
        // Note that we allow duplicate-name internal nodes to have
        // feature metadata (which is indexed by node name), so even if there
        // are multiple node keys they should all have the same name and
        // therefore share feature metadata.
        if (this.hasFeatureMetadata) {
            this.makeFeatureMetadataTable(this.nodeKeys[0], "int");
        }

        // 2. Compute sample presence information for this node.
        // (NOTE: this does not prevent "double-counting" samples, so the
        // aggregation for duplicate names should be fixed.)

        // force-reset the selection buffer
        this._samplesInSelection = [];

        if (isUnambiguous) {
            // this.nodeKeys has a length of 1
            var nodeKey = this.nodeKeys[0];
            this.setNodeLengthLabel(nodeKey);
            if (this.hasSampleMetadata) {
                var tips = this.empress._tree.findTips(nodeKey);
                var samplePresence = this.empress.computeIntSamplePresence(
                    nodeKey,
                    this.fields
                );
                this.makeSampleMetadataTable(
                    samplePresence.fieldsMap,
                    "int",
                    samplePresence.diff.length,
                    tips.length
                );
                this._samplesInSelection = samplePresence.samples;
            }
        } else {
            // If isUnambiguous is false, we can't show information about
            // single nodes (e.g. node lengths)
            hide(this.nodeLengthContainer);
            if (this.hasSampleMetadata) {
                hide(this.smTable);
                hide(this.smAddSection);
                hide(this.smNotInTableWarning);
                this.smNotes.textContent =
                    "Multiple internal nodes are selected. We can't " +
                    "identify the samples containing these nodes' " +
                    "descendant tips, if present, due to the ambiguity.";
                show(this.smNotes);
            }
        }
    };

    /**
     * Updates and shows the node length UI elements for a given node.
     *
     * (If the node is the root of the tree, this will actually hide the UI
     * elements. See Empress.getNodeLength() for details.)
     *
     * @param {Number} nodeKey Postorder position of a node in the tree.
     */
    SelectedNodeMenu.prototype.setNodeLengthLabel = function (nodeKey) {
        var nodeLength = this.empress.getNodeLength(nodeKey);
        if (nodeLength !== null) {
            this.nodeLengthLabel.textContent = nodeLength;
            show(this.nodeLengthContainer);
        } else {
            // Don't show the length for the root node
            hide(this.nodeLengthContainer);
        }
    };

    /**
     * Resets the state machine.
     */
    SelectedNodeMenu.prototype.clearSelectedNode = function () {
        this.smTable.innerHTML = "";
        this.fmTable.innerHTML = "";
        this.nodeKeys = null;
        hide(this.box);
        this.drawer.loadSelectedNodeBuff([]);
        this.empress.drawTree();

        if (this.hiddenCallback !== null) {
            this.hiddenCallback(this._samplesInSelection);
        }
        this._samplesInSelection = [];
    };

    /**
     * Sets the nodeKeys parameter of the state machine. This method will also
     * set the buffer to highlight the selected nodes.
     *
     * @param {Array} nodeKeys An array of node keys representing the
     *                         nodes to be selected. The keys should be the
     *                         post order position of the nodes. If this array
     *                         has multiple entries (i.e. multiple nodes are
     *                         selected), the node selection menu will be
     *                         positioned at the first node in this array.
     */
    SelectedNodeMenu.prototype.setSelectedNodes = function (nodeKeys) {
        // If nodeKeys includes multiple nodes, verify that all of these nodes
        // share the same name. If this _isn't_ the case, something is wrong.
        var i;
        if (nodeKeys.length > 1) {
            var name = this.empress.getNodeInfo(nodeKeys[0], "name");
            for (i = 1; i < nodeKeys.length; i++) {
                if (this.empress.getNodeInfo(nodeKeys[i], "name") !== name) {
                    throw new Error(
                        "setSelectedNodes(): keys do not represent the same " +
                            "node name."
                    );
                }
            }
        }
        /* Highlight the nodes in nodeKeys on the canvas.
         * The buffer that holds this information is formatted as
         * [x, y, rgb, ...] where x, y are the coords of the
         * highlighted node(s) and rgb is the RGB float corresponding to the
         * node highlighting color.
         */
        var highlightedNodes = [];
        for (i = 0; i < nodeKeys.length; i++) {
            var node = nodeKeys[i];
            var x = this.empress.getX(node);
            var y = this.empress.getY(node);
            // Add a green circle indicating the highlighted node(s)
            highlightedNodes.push(...[x, y, 65280]);
        }

        // send the buffer array to the drawer
        this.drawer.loadSelectedNodeBuff(highlightedNodes);

        // save the node keys to the selected node menu state machine
        this.nodeKeys = nodeKeys;
    };

    /**
     * Set the coordinates of the node menu box at the first node in nodeKeys.
     * This means that, if only a single node is selected, the menu will be
     * placed at this node's position; if multiple nodes are selected, the menu
     * will be placed at the first node's position.
     */
    SelectedNodeMenu.prototype.updateMenuPosition = function () {
        if (this.nodeKeys === null) {
            return;
        }

        var nodeToPositionAt = this.nodeKeys[0];
        // get table coords
        var x = this.empress.getX(nodeToPositionAt);
        var y = this.empress.getY(nodeToPositionAt);
        var tableLoc = this.drawer.toScreenSpace(x, y);

        // set table location. add slight offset to location so menu appears
        // next to the node instead of on top of it.
        this.box.style.left = Math.floor(tableLoc.x + 23) + "px";
        this.box.style.top = Math.floor(tableLoc.y - 43) + "px";
    };

    return SelectedNodeMenu;
});
