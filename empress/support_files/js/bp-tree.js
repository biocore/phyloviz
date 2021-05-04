define(["ByteArray", "underscore"], function (ByteArray, _) {
    /**
     *
     * @class BPTree
     *
     * Initialzes a new BP tree.
     *
     * @param {Array} b The array that represents the tree structure
     * @param {Array} names The names of each node stored in preorder
     * @param {Array} lengths The lengths of each node stored in preorder
     * @param {Number} coding The number of 1/0s coded in the tree, null not
     *                        coded
     *
     * @return {BPTree}
     * @constructs BPTree
     */
    function BPTree(b, names = null, lengths = null, coding = 51) {
        if (coding !== null) {
            var b_len = b.length - 1;
            var decoded_b = [];

            const _helper_decode = function (s) {
                return s === "1" ? 1 : 0;
            };

            _.each(b, function (value, i) {
                if (value === 0) {
                    decoded_b.push.apply(decoded_b, [0]);
                } else {
                    var element = value
                        .toString(2)
                        .split("")
                        .map(_helper_decode);

                    // We need to pad the number if we are not in the last
                    // number of the list
                    // Note that we ae padding with 51, which should match the
                    // python code
                    if (i < b_len && element.length < 51) {
                        var padding = new Array(coding - element.length).fill(
                            0
                        );
                        decoded_b.push.apply(decoded_b, padding);
                    }
                    decoded_b.push.apply(decoded_b, element);
                }
            });

            b = decoded_b;
        }

        /**
         * @type {Array}
         * Used to store the structure of the tree
         * @private
         */
        this.b_ = b;

        /**
         * @type {Number}
         * Number of nodes in tree
         */
        this.size = this.b_.length / 2;

        /**
         * @type {Array}
         * @private
         * stores the name of each node in postorder. If names are not provided
         * then the names will be set to null by default.
         * Note: if memory becomes an issue this could be converted into a
         *       Uint16Array
         */
        this.names_ = names ? names : null;

        /**
         * @type {Array}
         * @private
         * caches the number of tips under each node. Stores nodes in their
         * postorder position. Postorder positions start at index 1 thus index
         * 0 is considered "undefined".
         * Note: leaf nodes have 1 tips
         */
        this._numTips = new Array(this.size + 1).fill(0);

        /**
         * @type {Array}
         * @private
         * Stores the length of the nodes in postorder. If lengths are not
         * provided then lengths will be set to null.
         */
        this.lengths_ = lengths ? lengths : null;

        /**
         * @type {Uint32Array}
         * @private
         * r0Cache[i] represents rank(0,i) in this.b
         * Note: rank(0,i) = number of 0's between indices [0,i] in this.b
         * TODO: implement a rmM tree and calculate this on the fly
         */
        this.r0Cache_ = ByteArray.sumVal(this.b_, Uint32Array, 0);

        /**
         * @type {Uint32Array}
         * @private
         * r1Cache[i] represents rank(1,i) in this.b
         * TODO: implement a rmM tree and calculate this on the fly
         */
        this.r1Cache_ = ByteArray.sumVal(this.b_, Uint32Array, 1);

        /**
         * @type {Uint32Array}
         * @private
         * s0Cache[i] represents select(0,i) in this.b
         * Note: select(0,i) = the index of the ith 0 in this.b
         * TODO: implement a rmM tree and calculate this on the fly
         */
        this.s0Cache_ = ByteArray.seqUniqueIndx(this.r0Cache_, Uint32Array);

        /**
         * @type {Uint32Array}
         * @private
         * s1Cache[i] represents select(1,i) in this.b
         * TODO: implement a rmM tree and calculate this on the fly
         */
        this.s1Cache_ = ByteArray.seqUniqueIndx(this.r1Cache_, Uint32Array);

        /**
         * @type {Uint32Array}
         * @private
         * excess is used frequently so we can cache it to get a slight
         * performance boost
         */
        var eCache = [];
        var i;
        for (i = 0; i < this.b_.length; i++) {
            eCache.push(2 * this.r1Cache_[i] - i - 1);
        }
        this.eCache_ = new Uint32Array(eCache);

        /**
         *
         * @type {Uint32Array}
         * @private
         * open/close cache to boost performance but at cost of memory. This can
         * be optimized with use of rrm-tre
         */
        this.ocCache_ = new Uint32Array(this.b_.length);
        var openInx = 0;
        var oc = [];
        // We don't declare "var i" since it was already declared above
        for (i = 0; i < this.b_.length; i++) {
            if (this.b_[i]) {
                oc.push(i);
            } else {
                openInx = oc.pop();
                this.ocCache_[openInx] = i;
                this.ocCache_[i] = openInx;
            }
        }

        /**
         * @type{Array}
         * @private
         *
         * Stores the order of nodes in an in-order traversal. Elements in this
         * array are node ids
         *
         * Note: In-order is stored because bp-tree doesn't have
         *       an efficient way of convert a nodes in-order position to tree
         *       index and vice versa like it does with post order through
         *       the use of postorderselect() and postorder(). So it is more
         *       efficient to cache an in-order tree traversal.
         */
        this._inorder = null;

        /**
         * @type{Array}
         * @private
         *
         * Stores the order of nodes in ascending and descending-leaf-sorted
         * postorder traversals. Elements in this array are node IDs.
         */
        this._ascendingLeafSorted = null;
        this._descendingLeafSorted = null;

        /**
         * @type {Object}
         * @private
         * This object is used to cache name look ups. Keys are node names and
         * values are an array of all nodes (defined by the postorder position)
         * that have the same name.
         */
        this._nameToNodes = {};

        /**
         * @type {Array}
         * @private
         * Cache Parent nodes. This will help speed up a lot of methods that
         * make calls to parent.
         */
        this._pCache = [];
        var pStack = [];
        for (i = 0; i < this.b_.length - 1; i++) {
            if (this.b_[i] === 1) {
                if (pStack.length === 0) {
                    pStack.push(i);
                    this._pCache[i] = 0;
                } else if (this.b_[i + 1] === 1) {
                    this._pCache[i] = pStack[pStack.length - 1];
                    pStack.push(i);
                } else if (this.b_[i + 1] === 0) {
                    this._pCache[i] = pStack[pStack.length - 1];
                }
            } else if (this.b_[i] === 0) {
                this._pCache[i] = pStack[pStack.length - 1];
                if (this.b_[i + 1] === 0) {
                    pStack.pop();
                }
            }
        }
    }

    /**
     * Returns an Object describing the minimum, maximum, and average of all
     * non-root node lengths.
     *
     * @return {Object} Contains three keys: "min", "max", and "avg", mapping
     *                  to Numbers representing the minimum, maximum, and
     *                  average non-root node length in the tree.
     * @throws {Error} If this tree does not have length information (i.e.
     *                 this.lengths_ is null; this should only happen during
     *                 testing).
     */
    BPTree.prototype.getLengthStats = function () {
        // first check if tree only contains 1 node (length === 2 since the
        // lengths array starts at index 1.)
        if (this.lengths_ !== null && this.lengths_.length === 2) {
            return { min: "N/A", max: "N/A", avg: "N/A" };
        } else if (this.lengths_ !== null) {
            var min = Number.POSITIVE_INFINITY,
                max = Number.NEGATIVE_INFINITY,
                sum = 0,
                avg = 0;
            // non-root lengths should be guaranteed to be nonnegative, and
            // at least one non-root length should be positive.
            //
            // The x = 1, skips the first element (lengths_ is 1-indexed);
            // the x < this.lengths_.length - 1 skips the last element
            // (corresponding to the root length, which we ignore on purpose)
            for (var x = 1; x < this.lengths_.length - 1; x++) {
                min = Math.min(min, this.lengths_[x]);
                max = Math.max(max, this.lengths_[x]);
                sum += this.lengths_[x];
            }
            min = min;
            max = max;
            avg = sum / (this.size - 1);
            return { min: min, max: max, avg: avg };
        } else {
            throw new Error("No length information defined for this tree.");
        }
    };

    /**
     *
     * Returns the number of times bit t was observed leading upto bit t
     *
     * @param{Number} t Bit value, 0 is an close paraenthesis and 1 is an
     *      open parenthesis.
     * @param{Number} i Position to evaluate
     *
     * @return{Number}
     */
    BPTree.prototype.rank = function (t, i) {
        var rCache = t ? this.r1Cache_ : this.r0Cache_;
        return rCache[i];
    };

    /**
     *
     * Returns the position of the kth occurance of bit t
     *
     * @param{Number} t Bit value, 0 is an close paraenthesis and 1 is an
     *      open parenthesis.
     * @param{Number} k The rank of bit t to find
     *
     * @return{Number}
     */
    BPTree.prototype.select = function (t, k) {
        var sCache = t ? this.s1Cache_ : this.s0Cache_;
        return sCache[k - 1];
    };

    /**
     *
     * The excess at position i is the number of 1's - 0's.
     * i.e. rank(1,i) - rank(0,i)
     *
     * @oaram{Number} i The position to calculate the excess
     *
     * @return{Number} The excess at position i
     * @private
     */
    BPTree.prototype.excess_ = function (i) {
        // need to subtract 1 since i starts at 0
        // Note: rank(1,i) - rank(0,i) = (2*(rank(1,i)) - i
        return 2 * this.r1Cache_[i] - i - 1;
    };

    /**
     *
     * The depth of the ith node in preorder
     *
     * @param{Number} i Node i in preorder
     *
     * @return{Number} Depth of node i
     */
    BPTree.prototype.depth = function (i) {
        //depth is same as excess
        return this.eCache_[i];
    };

    /**
     *
     * The name of the ith node in bp tree
     *
     * @param{Number} i Node i in bp tree
     *
     * @return{String}
     */
    BPTree.prototype.name = function (i) {
        return this.names_[this.postorder(i)];
    };

    /**
     * Returns an array of all node names in tree.
     */
    BPTree.prototype.getAllNames = function () {
        var names = _.clone(this.names_);
        // Currently, names_ is uses 1-based index (see issue @223). So we need
        // to delete first element.
        names.shift();
        return names;
    };

    /**
     *
     * The number of leaf nodes in tree
     *
     * @return {Number}
     */
    BPTree.prototype.numleaves = function () {
        var total = 0;
        for (var i = 0; i < this.b_.length - 1; i++) {
            total = this.isleaf(i) ? total + 1 : total;
        }
        return total;
    };

    /**
     *
     * The length of the ith node in bp tree
     *
     * @param{Number} i Node i in bp tree
     *
     * @return{Number}
     */
    BPTree.prototype.length = function (i) {
        return this.lengths_[this.postorder(i)];
    };

    /**
     * Forward search finds the next jth index that has d more excess than i
     *
     * @param {Number} i The index to start the search
     *                 Note: i is the absolue index into this.b and does not
     *                 represent a nodes position unlike other function.
     * @param {Number} d Returns the jth index with d more excess than i
     *
     * @return {Number}
     */
    BPTree.prototype.fwdsearchNaive = function (i, d) {
        var b = this.eCache_[i] + d;
        for (var j = i + 1; i < this.b_.length; j++) {
            if (this.eCache_[j] === b) {
                return j;
            }
        }

        // an index could not be found that satisfies the conditions
        return -1;
    };

    /**
     * Currently this is just place holder
     */
    BPTree.prototype.fwdsearch = function (i, d) {
        return this.fwdsearchNaive(i, d);
    };

    /**
     * Backward search find the previous jth index with d more excess than i
     *
     * @param {Number} i The index to start the search
     *                 Note: i is the absolue index into this.b and does not
     *                 represent a nodes position unlike other function.
     * @param {Number} d Returns the jth index with d more excess than i
     *
     * @return {Number}
     */
    BPTree.prototype.bwdsearchNaive = function (i, d) {
        var b = this.eCache_[i] + d;
        for (var j = i - 1; j >= 0; j--) {
            if (this.eCache_[j] === b) {
                return j;
            }
        }

        // an index could not be found
        return -1;
    };

    /**
     * Currently this is just a place holder
     */
    BPTree.prototype.bwdsearch = function (i, d) {
        return this.bwdsearchNaive(i, d);
    };

    /**
     * Finds the position of the opening parenthesis that matches b[i]
     *
     * @param {Number} i Index to open. i is returned if i is an open paraen
     *                 i can be either an open or close parenthesis
     *
     * @return {Number}
     */
    BPTree.prototype.open = function (i) {
        return this.b_[i] ? i : this.ocCache_[i];
    };

    /**
     * Find the position of the closing parenthesis that matches b[i]
     *
     * @param {Number} i Index to close. i is returned if i is an close paraen
     *                 i can be either an open or close parenthesis
     *
     * @return {Number}
     */
    BPTree.prototype.close = function (i) {
        return this.b_[i] ? this.ocCache_[i] : i;
    };

    /**
     * Returns the opening index of the smallest matching pair that contains i
     *
     * @param {Number} i Index to enclose.
     *                 i can be either an open or close parenthesis
     *
     * @return {Number}
     */
    BPTree.prototype.enclose = function (i) {
        // i is an open paren
        if (this.b_[i]) {
            return this.bwdsearch(i, -2) + 1;
        }

        // i is a close paren
        return this.bwdsearch(i - 1, -2) + 1;
    };

    /**
     * The opening index of the smallest matching pair that contains the node
     * represented by i
     *
     * @param{Number} i Current node
     *                i can be either an open or close parenthesis
     *
     * @return {Number}
     */
    BPTree.prototype.parent = function (i) {
        // i represents the root node
        if (i === this.root() || i === this.b_.length - 1) {
            return -1;
        }

        return this._pCache[i];
    };

    /**
     * returns the index of the opening index of the root node
     *
     * @return {Number}
     */
    BPTree.prototype.root = function () {
        return 0;
    };

    /**
     * Return true if i represents a leaf node
     *
     * @return {Boolean}
     */
    BPTree.prototype.isleaf = function (i) {
        return this.b_[i] && !this.b_[i + 1];
    };

    /**
     * returns the opening index the first child of the node represented by i
     *
     * @param {Number} i Current node
     *                 i can be either an open or close parenthesis
     *
     * @return {Number} return 0 if i is a leaf node
     */
    BPTree.prototype.fchild = function (i) {
        if (this.isleaf(i)) {
            return 0;
        }

        if (this.b_[i]) {
            return i + 1;
        } else {
            return this.fchild(this.open(i));
        }
    };

    /**
     * returns the opening index the last child of the node represented by i
     *
     * @param {Number} i Current node
     *                 i can be either an open or close parenthesis
     * @return {Number} return 0 if i is a leaf node
     */
    BPTree.prototype.lchild = function (i) {
        if (this.isleaf(i)) {
            return 0;
        }

        if (this.b_[i]) {
            return this.open(this.close(i) - 1);
        } else {
            return this.lchild(this.open(i));
        }
    };

    /**
     * returns the opening index of the next sibling of i
     *
     * @param {Number} i Current node.
     *                 i can be either an open or close parenthesis
     *
     * @return {Number}
     */
    BPTree.prototype.nsibling = function (i) {
        // i is a close parenthesis
        if (!this.b_[i]) {
            return this.nsibling(this.open(i));
        }

        var pos = this.close(i) + 1;
        if (pos >= this.b_.length) {
            // i is the root node
            return 0;
        } else if (this.b_[pos]) {
            return pos;
        }

        // i does not have a next sibling
        return 0;
    };

    /**
     * returns the opening index of the previous sibling of i
     *
     * @param {Number} i Current node.
     *                 i can be either an open or close parenthesis
     *
     * @return {Number} returns 0 if no previous sibling
     */
    BPTree.prototype.psibling = function (i) {
        var pos = 0;

        // check to see if i is root
        if (i === this.root()) {
            return 0;
        }

        // i is close paren
        if (!this.b_[i]) {
            return this.psibling(this.open(i));
        }

        // check to see if i open paren
        if (this.b_[i]) {
            // i is fchild
            if (this.b_[i - 1]) {
                return 0;
            }

            pos = this.open(i - 1);
        }

        if (pos < 0) {
            return 0;
        } else if (this.b_[pos]) {
            return pos;
        }

        // no previous found
        return 0;
    };

    /**
     * Finds postorder rank of node i
     *
     * @param {Number} i The node index to asses postorder rank
     *
     * @return {Number} The postorder rank of node i
     */
    BPTree.prototype.postorder = function (i) {
        if (this.b_[i]) {
            return this.rank(0, this.close(i));
        } else {
            return this.rank(0, i);
        }
    };

    /**
     * Find the index of the node with postorder k
     *
     * @param {Number} k The postorder to search for
     *                 Note: k starts at 1
     *
     * @return {Number} The index position of the node in the tree
     */
    BPTree.prototype.postorderselect = function (k) {
        return this.open(this.select(0, k));
    };

    /**
     * Finds preorder rank of node i
     *
     * @param {Number} i The node index to asses preorder rank
     *
     * @return {Number} The preorder rank of node i
     */
    BPTree.prototype.preorder = function (i) {
        if (this.b_[i]) {
            return this.rank(1, i);
        } else {
            return this.preorder(this.open(i));
        }
    };

    /**
     * Find the index of the node with preorder k
     *
     * @param {Number} k The preorder to search for.
     *                 Note: k starts at 1.
     *
     * @return {Number} The index position of the node in the tree
     */
    BPTree.prototype.preorderselect = function (k) {
        return this.select(1, k);
    };

    /**
     * Returns an array of nodes sorted by their inorder position.
     *
     * Note: empress uses a nodes postorder position as its key in _treeData
     *       so this method will use a nodes postorder position to represent
     *       it in the resulting array.
     *       This method will also cache the resulting array.
     */
    BPTree.prototype.inOrderNodes = function () {
        if (this._inorder !== null) {
            return _.clone(this._inorder);
        }

        // the root node of the tree
        var curNode = this.preorderselect(1);
        var nodeStack = [curNode];
        this._inorder = [];
        while (nodeStack.length > 0) {
            // "visit" node
            curNode = nodeStack.shift();
            this._inorder.push(this.postorder(curNode));

            // append children to stack
            nodeStack = nodeStack.concat(this.getChildren(curNode));
        }
        return _.clone(this._inorder);
    };

    /**
     * Finds the sum of lengths from start to end.
     *
     * Note: start must be a descendant of end. An error will be thrown if start
     *       is not a descendant of end. Also, this method does not take into
     *       account the length of end since that length would represent the
     *       length of end to its parent.
     *
     * @param {Number} start The postorder position of a node
     * @param {Number} end The postorder position of a node
     * @param {Boolean} ignoreLengths If truthy, treat all node lengths as 1;
     *                                if falsy, actually consider node lengths
     *
     * @return {Number} the sum of length from start to end
     */
    BPTree.prototype.getTotalLength = function (start, end, ignoreLengths) {
        var curNode = start;
        var totalLength = 0;
        while (curNode !== end) {
            var popos = this.postorderselect(curNode);
            var nodeLen = ignoreLengths ? 1 : this.length(popos);
            totalLength += nodeLen;
            curNode = this.parent(popos);
            if (curNode === -1) {
                throw "Node " + start + " must be a descendant of " + end;
            }
            curNode = this.postorder(curNode);
        }
        return totalLength;
    };

    /**
     * Retrieve the tips in the subtree of a given (internal) node key.
     *
     * @param {Number} nodeKey Key value of internal node.
     * @return {Array} tips Tips of the subtree.
     */
    BPTree.prototype.findTips = function (nodeKey) {
        // find first and last preorder positions of the subtree spanned
        // by the current internal node
        var n = this.postorderselect(nodeKey);

        // check for root to account for cases when all tips have been sheared
        if (this.isleaf(n) && nodeKey !== this.postorder(this.root())) {
            throw "Error: " + nodeKey + " is a tip!";
        }
        var start = this.preorder(this.fchild(n));
        var end = this.preorder(this.lchild(n));
        while (!this.isleaf(this.preorderselect(end))) {
            end = this.preorder(this.lchild(this.preorderselect(end)));
        }

        // find all tips within the subtree
        var tips = [];
        for (var j = start; j <= end; j++) {
            var node = this.preorderselect(j);
            if (this.isleaf(node)) {
                tips.push(this.postorder(node));
            }
        }

        return tips;
    };

    /**
     * Retrieve number of tips in the subtree of a given node.
     *
     * @param {Integer} nodeKey The postorder position of a node
     * @return {Integer} The number of tips on the subtree rooted at nodeKey.
     */
    BPTree.prototype.getNumTips = function (nodeKey) {
        if (this._numTips[nodeKey] !== 0) {
            return this._numTips[nodeKey];
        }

        var open = this.postorderselect(nodeKey);
        if (this.isleaf(open)) {
            this._numTips[nodeKey] = 1;
            return this._numTips[nodeKey];
        }
        var close = this.close(open);
        var numTips = 0;
        for (var i = open + 1; i < close; i++) {
            if (this.b_[i] === 1 && this.b_[i + 1] === 0) {
                numTips += 1;
            }
        }
        this._numTips[nodeKey] = numTips;
        return numTips;
    };

    /**
     * Returns a list of nodes' postorder positions in the tree, using "leaf
     * sorting" -- clades at the same level are sorted by the number of leaves
     * they contain.
     *
     * This (usually) makes the tree look pretty.
     *
     * This code behaves similarly to this.inOrderNodes(), in that it caches
     * the result once computed. Therefore, this function should be faster the
     * second time it's called (assuming the sortingMethod is the same).
     *
     * @param {String} sortingMethod Either "ascending" or "descending". Any
     *                               other values will trigger an error.
     *                               -"ascending": Order clades starting with
     *                                the clade with the fewest tips and ending
     *                                with the clade with the most tips (ties
     *                                broken arbitrarily).
     *                               -"descending": Opposite of "ascending"
     *                                (start with most-tip clades then go down;
     *                                ties broken arbitrarily).
     * @return {Array} Array of nodes' postorder positions in the tree, sorted
     *                 as specified.
     * @throws {Error} if sortingMethod is not "ascending" or "descending".
     *
     * REFERENCES
     * ----------
     * This was translated from this Python code to do leaf-sorted postorder
     * traversal over a scikit-bio TreeNode:
     * https://github.com/biocore/empress/commit/2b3d90f52fc3118b3641ddc6378d3659abdb0d05
     *
     * That code was in turn a slightly modified version of scikit-bio's
     * postorder tree traversal code:
     * https://github.com/biocore/scikit-bio/blob/6ccba4076f1b96843fa2428804cc5a91bf4b76b8/skbio/tree/_tree.py#L1085-L1154
     *
     * And this functionality was inspired by iTOL's use of it, of course:
     * https://itol.embl.de/help.cgi (see the "Leaf sorting:" text)
     */
    BPTree.prototype.postorderLeafSortedNodes = function (sortingMethod) {
        if (sortingMethod === "ascending") {
            if (this._ascendingLeafSorted !== null) {
                return this._ascendingLeafSorted;
            }
        } else if (sortingMethod === "descending") {
            if (this._descendingLeafSorted !== null) {
                return this._descendingLeafSorted;
            }
        } else {
            throw new Error(
                "Unrecognized leaf sorting method " + sortingMethod
            );
        }
        var outputNodes = [];
        var childIdxStack = [0];
        var rootNode = this.preorderselect(1);
        var currNode = rootNode;
        var currChildren = this.getSortedChildren(currNode, sortingMethod);
        var currChildrenLen = currChildren.length;
        var currIdx, currChild;
        while (true) {
            currIdx = childIdxStack[childIdxStack.length - 1];
            // If children left, process them.
            if (currIdx < currChildrenLen) {
                currChild = currChildren[currIdx];
                // If currChild has children, go there.
                if (!this.isleaf(currChild)) {
                    childIdxStack.push(0);
                    currNode = currChild;
                    currChildren = this.getSortedChildren(
                        currNode,
                        sortingMethod
                    );
                    currChildrenLen = currChildren.length;
                    currIdx = 0;
                }
                // Otherwise, add this child.
                else {
                    outputNodes.push(this.postorder(currChild));
                    childIdxStack[childIdxStack.length - 1]++;
                }
            }
            // If no children left, add self and move on to self's parent
            else {
                outputNodes.push(this.postorder(currNode));
                if (currNode === rootNode) {
                    break;
                }
                currNode = this.parent(currNode);
                currChildren = this.getSortedChildren(currNode, sortingMethod);
                currChildrenLen = currChildren.length;
                childIdxStack.pop();
                childIdxStack[childIdxStack.length - 1]++;
            }
        }
        // Cache the results so we don't have to do all that again
        if (sortingMethod === "ascending") {
            this._ascendingLeafSorted = outputNodes;
        } else {
            this._descendingLeafSorted = outputNodes;
        }
        return outputNodes;
    };

    /**
     * Returns an array containing the children of a node.
     *
     * The order of the array is based on fchild and nsibling, which I think
     * should match what done in the input Newick file.
     *
     * If the input node has no children (i.e. it's a leaf / tip), this will
     * return an empty Array.
     *
     * @param {Number} node Index of the node. "Index" here refers to the
     *                      0-indexed position in the balanced parentheses of
     *                      the opening paren for the node in question, e.g.
     *                      0 1  2  3 4  5
     *                      ( () () ( () () ) )
     * @return {Array} children Array of child indices, specified analogously
     *                          to the node index above. As an example, the
     *                          children of node 3 in the tree above would be
     *                          4 and 5.
     */
    BPTree.prototype.getChildren = function (node) {
        var children = [];
        var child = this.fchild(node);
        while (child !== 0) {
            children.push(child);
            child = this.nsibling(child);
        }
        return children;
    };

    /**
     * Returns an array containing the children of a node, sorted by the number
     * of tips their subtrees contain.
     *
     * If the input node has no children (i.e. it's a leaf / tip), this will
     * return an empty Array.
     *
     * Ties (e.g. when an internal node's children are all tips, and thus
     * "contain" 1 tip) should respect the ordering in the initial Newick file,
     * since _.sortBy() is a stable sort: https://underscorejs.org/#sortBy
     *
     * (That said, we don't make any claims in the UI about this [at least not
     * for the ascending/descending leaf sorting options], so it's not a huge
     * deal.)
     *
     * @param {Number} node
     * @param {String} sortingMethod Should be one of "ascending" or
     *                               "descending". We don't bother validating
     *                               it at this point -- if another string is
     *                               passed in then the behavior of this
     *                               function is undefined (realistically it'll
     *                               probably just sort things in ascending
     *                               order, which is what it currently does in
     *                               that case, but we can't guarantee that
     *                               won't change).
     * @return {Array} children
     */
    BPTree.prototype.getSortedChildren = function (node, sortingMethod) {
        var scope = this;

        var children = this.getChildren(node);
        // Define a function mapping a node index to the number of tips its
        // subtree contains. This function will be used to sort the array
        // of children.
        var child2numTips = function (childIdx) {
            var numTips = scope.getNumTips(scope.postorder(childIdx));
            if (sortingMethod === "descending") {
                // Flip things around; sort in descending order. This should be
                // quicker than sorting in ascending order and then reversing
                // it afterwards.
                return -numTips;
            } else {
                return numTips;
            }
        };
        return _.sortBy(children, child2numTips);
    };

    /**
     * True if name is in the names array for the tree
     *
     * @param {String} name The name to search for.
     * @return {Boolean} If the name is in the tree.
     */
    BPTree.prototype.containsNode = function (name) {
        return this.names_.indexOf(name) !== -1;
    };

    /**
     * Returns all nodes with a given name. Once a name has been searched for,
     * the returned object is cached in this._nameToNodes.
     *
     * NOTE: Care should be taken to make sure that this._nameToNodes is not
     * populated with a literal null at any point, since Objects in JS store
     * all keys as Strings (so having a literal null in this._nameToNodes [due
     * to unnamed nodes] will cause this null to get confused with node(s)
     * literally named "null" in the Newick file). I don't think this is
     * currently possible in the code, but we should probably add tests that
     * verify this.
     *
     * @param {String} name The name of node(s)
     * @return {Array} An array of postorder positions of nodes with a given
     *                 name. If no nodes have the specified name, this will be
     *                 an empty array.
     */
    BPTree.prototype.getNodesWithName = function (name) {
        if (name in this._nameToNodes) {
            return _.clone(this._nameToNodes[name]);
        }

        this._nameToNodes[name] = [];
        for (var i = 1; i <= this.size; i++) {
            if (name === this.names_[i]) {
                this._nameToNodes[name].push(i);
            }
        }

        return _.clone(this._nameToNodes[name]);
    };

    /**
     * Returns a new BPTree object that contains just the tips (and ancestors)
     * of the nodes in keepTips.
     *
     * This method was ported from iow.
     * https://github.com/wasade/improved-octo-waddle/blob/0e9e75b77238acda6752f59d940620f89607ba6b/bp/_bp.pyx#L732
     *
     * @param {Set} keepTips The set of tip names to keep.
     *
     * @return {Object} An object containing the new tree ("tree") and two maps that
     *                  convert the original postorder positions to the sheared
     *                  tree postorder positions ("newToOld") and vice-versa ("oldToNew").
     */
    BPTree.prototype.shear = function (removeTips) {
        // closure
        var scope = this;

        // create new bit array
        var mask = _.clone(this.b_);

        var i, node;

        // remove tips
        for (i of removeTips) {
            node = this.postorderselect(i);
            mask[node] = undefined;
            mask[node + 1] = undefined;
        }

        // remove internal
        var nodeStack = [];
        for (i = mask.length - 1; i > 0; i--) {
            if (mask[i] === 0) {
                // close parentheses
                if (mask[i - 1] === 0) {
                    // close parentheses represents internal node
                    nodeStack.push([i, null]);
                } else if (mask[i - 1] === 1) {
                    // close parentheses represents non-removed tip
                    // thus we mark it as false so it is not removed
                    nodeStack.push([i, false]);
                } else if (mask[i - 1] === undefined) {
                    // close paretheses represents an internal node
                    // with at least one removed tip so we temporarly mark it
                    // as true to remove
                    nodeStack.push([i, true]);
                }
            } else if (mask[i] === 1) {
                //open parentheses
                node = nodeStack.pop();
                if (node[1] === true) {
                    // remove internal node
                    mask[i] = undefined;
                    mask[node[0]] = undefined;
                } else if (node[1] === false) {
                    // need explicitly check false since it can be null
                    // if node[1] is false that means it contains a tip and thus
                    // we need to mark its parent as false so it is not removed
                    nodeStack[nodeStack.length - 1][1] = false;
                }

                if (nodeStack[nodeStack.length - 1][1] === null) {
                    // if null then we set its remove status to whatever node
                    // was
                    nodeStack[nodeStack.length - 1][1] = node[1];
                }
            }
        }

        var newBitArray = [];
        var shearedToFull = new Map();
        var fullToSheared = new Map();
        var postorderPos = 1;
        // create new names and lengths array
        var names = [null];
        var lengths = [null];
        for (i = 0; i < mask.length; i++) {
            if (mask[i] !== undefined) {
                newBitArray.push(mask[i]);
            }

            // get name and length of node
            // Note: names and lengths of nodes are stored in postorder
            if (mask[i] === 0) {
                names.push(this.name(i));
                lengths.push(this.length(i));
                shearedToFull.set(postorderPos, this.postorder(i));
                fullToSheared.set(this.postorder(i), postorderPos);
                postorderPos += 1;
            }
        }

        return {
            shearedToFull: shearedToFull,
            fullToSheared: fullToSheared,
            tree: new BPTree(newBitArray, names, lengths, null),
        };
    };

    return BPTree;
});
