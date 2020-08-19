define(["underscore", "VectorOps", "util"], function (_, VectorOps, util) {
    /**
     *
     */
    function centerAtRoot(xCoords, yCoords) {
        var size = xCoords.length;
        var rX = xCoords[size - 1];
        var rY = yCoords[size - 1];

        // skip the first element since the tree is zero-indexed
        for (i = 1; i <= size - 1; i++) {
            xCoords[i] -= rX;
            yCoords[i] -= rY;
        }
    }

    /**
     * Rectangular layout.
     *
     * In this sort of layout, each tip has a distinct y-position, and parent
     * y-positions are centered over their descendant tips' positions.
     * x-positions are computed based on nodes' branch lengths.
     *
     * For a simple tree, this layout should look something like:
     *          __
     *      ___|
     *  ___|   |__
     * |   |___
     * |    ___
     * |___|
     *     |___
     *
     * For other resources see:
     *
     *  https://rachel53461.wordpress.com/2014/04/20/algorithm-for-drawing-trees/
     *      Clear explanation of Reingold-Tilford that I used a lot
     *  https://github.com/qiime/Topiary-Explorer/blob/master/src/topiaryexplorer/TreeVis.java
     *      Derived from the "Rectangular" layout algorithm code.
     *
     * @param {BPTree} tree The tree to generate the coordinates for.
     * @param {Float} width Width of the canvas where the tree will be
     *                      displayed.
     * @param {Float} height Height of the canvas where the tree will be
     *                       displayed.
     * @return {Object} Object with xCoords and yCoords properties where the
     *                  node coordinates are stored in postorder.
     */
    function rectangularLayout(tree, width, height) {
        // NOTE: This doesn't draw a horizontal line leading to the root "node"
        // of the graph. See https://github.com/biocore/empress/issues/141 for
        // context.

        var maxWidth = 0;
        var maxHeight = 0;
        var prevY = 0;
        var xCoord = new Array(tree.size + 1).fill(0);
        var yCoord = new Array(tree.size + 1).fill(0);
        var highestChildYr = new Array(tree.size + 1).fill(0);
        var lowestChildYr = new Array(tree.size + 1).fill(
            Number.POSITIVE_INFINITY
        );

        // postorder
        for (var i = 1; i <= tree.size; i++) {
            if (tree.isleaf(tree.postorderselect(i))) {
                yCoord[i] = prevY;
                prevY += 1;
                if (yCoord[i] > maxHeight) {
                    maxHeight = yCoord[i];
                }
            } else {
                // Center internal nodes above their children
                // We could also center them above their tips, but (IMO) this
                // looks better ;)
                var sum = 0;
                var numChild = 0;
                var child = tree.fchild(tree.postorderselect(i));
                while (child !== 0) {
                    child = tree.postorder(child);
                    sum += yCoord[child];
                    child = tree.nsibling(tree.postorderselect(child));
                    numChild++;
                }
                yCoord[i] = sum / numChild;
            }
        }

        // iterates in preorder
        for (i = 2; i <= tree.size; i++) {
            var node = tree.postorder(tree.preorderselect(i));
            var parent = tree.postorder(tree.parent(tree.preorderselect(i)));

            xCoord[node] = xCoord[parent] + tree.length(tree.preorderselect(i));
            if (maxWidth < xCoord[node]) {
                maxWidth = xCoord[node];
            }
        }

        // We don't check if max_width == 0 here, because we check when
        // constructing an Empress tree that it has at least one positive
        // branch length and no negative branch lengths. (And if this is the
        // case, then max_width must be > 0.)
        var xScalingFactor = width / maxWidth;

        // Since this will be multiplied by 0 for every node, we can set
        // this to any real number and get the intended "effect" of keeping
        // every node's y-coordinate at 0.
        var yScalingFactor = 1;

        // Having a max_height of 0 could actually happen, in the funky case
        // where the entire tree is a straight line (e.g. A -> B -> C). In
        // this case our "rectangular layout" drawing places all nodes on
        // the same y-coordinate (0), resulting in max_height = 0.
        // ... So, that's why we only do y-scaling if this *isn't* the case.
        if (maxHeight > 0) {
            yScalingFactor = height / maxHeight;
        }

        for (i = 1; i <= tree.size; i++) {
            xCoord[i] *= xScalingFactor;
            yCoord[i] *= yScalingFactor;
        }

        var rX = xCoord[tree.size];
        var rY = yCoord[tree.size];

        // skip the first element since the tree is zero-indexed
        for (i = 1; i < tree.size; i++) {
            xCoord[i] -= rX;
            yCoord[i] -= rY;

            // Determine highest and lowest child y-position for internal nodes
            // in the rectangular layout; used to draw vertical lines for these
            // nodes.

            // NOTE / TODO: This will have the effect of drawing vertical lines
            // even for nodes with only 1 child -- in this case
            // lowest_child_yr == highest_child_yr for this node, so all of the
            // stuff drawn in WebGL for this vertical line shouldn't show up.
            // I don't think this should cause any problems, but it may be worth
            // detecting these cases and not drawing vertical lines for them in
            // the future.
            var parent = tree.postorder(tree.parent(tree.postorderselect(i)));
            if (yCoord[i] > highestChildYr[parent]) {
                highestChildYr[parent] = yCoord[i];
            }

            if (yCoord[i] < lowestChildYr[parent]) {
                lowestChildYr[parent] = yCoord[i];
            }
        }
        xCoord[tree.size] -= rX;
        yCoord[tree.size] -= rY;

        // We draw each internal node as a vertical line ranging from its
        // lowest child y-position to its highest child y-position, and then
        // draw horizontal lines from this line to all of its child nodes
        // (where the length of the horizontal line is proportional to the node
        // length in question).
        return {
            xCoord: xCoord,
            yCoord: yCoord,
            highestChildYr: highestChildYr,
            lowestChildYr: lowestChildYr,
            yScalingFactor: yScalingFactor,
        };
    }

    /**
     * "Circular" version of the rectangular layout.
     *
     * ANGLES
     * ------
     * Tips are arranged around the border of a circle (a.k.a. assigned an
     * angle in the range [0, 2pi] in radians), and (non-root) internal nodes
     * are assigned an angle equal to the average of their children's. This
     * process is analogous to the assignment of y coordinates in the
     * rectangular layout.
     *
     * RADII
     * -----
     * All nodes are then assigned a radius equal to the sum of their branch
     * lengths descending from the root (not including the root's branch
     * length, if provided: the root node is consistently represented as a
     * single point in the center of the layout). This mirrors the assignment
     * of x-coordinates in the rectangular layout.
     *
     * ARCS
     * ----
     * Finally, we create arcs for every non-root internal node connecting the
     * "start points" of the child nodes of that node with the minimum and
     * maximum angle. (These points should occur at the radius equal to the
     * "end point" of the given non-root internal node.) These arcs should
     * ideally be drawn as Bezier curves or something, but they can also be
     * approximated by making multiple line segments throughout the curve.
     * These arcs are analogous to the vertical lines drawn for the rectangular
     * layout: they visually connect all of the children of an internal node.
     *
     * ROOT NODE
     * ---------
     * The root node of the tree is not drawn like other nodes in the tree.
     * Like the other layouts, It will always be positioned at (0, 0) -- for
     * the circular layout, this point is the center of the "circle"
     * constructed during layout. Since the root's "end point" is the same as
     * its "start point," it's not possible to draw a visible arc.
     * (We could draw the root's branch length if desired, but for simplicity
     * and consistency's sake this is omitted. This mirrors how the root is
     * represented in the rectangular layout.)
     *
     * REFERENCES
     * ----------
     * https://github.com/qiime/Topiary-Explorer/blob/master/src/topiaryexplorer/TreeVis.java
     *     Description above + the implementation of this algorithm derived
     *     from the Polar layout algorithm code.
     *
     * @param {BPTree} tree The tree to generate the coordinates for.
     * @param {Float} startAngle The first tip in the tree visited is assigned
     *                           this angle (in radians). Can be used to rotate
     *                           the tree: 0 is the eastmost point of the
     *                           theoretical "circle" surrounding the root
     *                           node, Math.PI / 2 is the northmost point of
     *                           that circle, etc.). I believe this is
     *                           analogous to how the "rotation" parameter of
     *                           iTOL works.
     * @param {Boolean} ignoreLengths If falsy, branch lengths are used in the
     *                                layout; otherwise, a uniform length of 1
     *                                is used.
     * @return {Object} Object with the following properties:
     *                   -x0, y0 ("starting point" x and y)
     *                   -x1, y1 ("ending point" x and y)
     *                   -angle (angle on the circle this node was assigned)
     *                   -arcx0, arcy0 (arc start point for max-angle child x
     *                    and y)
     *                   -arcStartAngle
     *                   -arcEndAngle
     *                  Each of these properties maps to an Arrays where data
     *                  for each node is stored in postorder. The arc* values
     *                  will be 0 for all leaf nodes, and all values will be 0
     *                  for the root node.
     */
    function circularLayout(tree, startAngle = 0, ignoreLengths = false) {
        // Set up arrays we're going to store the results in
        var x0 = new Array(tree.size + 1).fill(0);
        var y0 = new Array(tree.size + 1).fill(0);
        var x1 = new Array(tree.size + 1).fill(0);
        var y1 = new Array(tree.size + 1).fill(0);
        var angle = new Array(tree.size + 1).fill(0);
        // (We don't return the radius values, but we need to keep track of
        // them throughout this function anyway)
        var radius = new Array(tree.size + 1).fill(0);
        // Arc information (only relevant for non-root internal nodes)
        var arcx0 = new Array(tree.size + 1).fill(0);
        var arcy0 = new Array(tree.size + 1).fill(0);
        var arcStartAngle = new Array(tree.size + 1).fill(0);
        var arcEndAngle = new Array(tree.size + 1).fill(0);

        var anglePerTip = (2 * Math.PI) / tree.numleaves();
        var prevAngle = startAngle;
        var child, currRadius;

        // Iterate over the tree in postorder, assigning angles
        // Note that we skip the root (using "i < tree.size" and not "<="),
        // since the root's angle is irrelevant
        for (var i = 1; i < tree.size; i++) {
            if (tree.isleaf(tree.postorderselect(i))) {
                angle[i] = prevAngle;
                prevAngle += anglePerTip;
            } else {
                // Assign internal nodes an angle of the average of their
                // children's angles
                var angleSum = 0;
                var numChildren = 0;
                child = tree.fchild(tree.postorderselect(i));
                while (child !== 0) {
                    child = tree.postorder(child);
                    angleSum += angle[child];
                    child = tree.nsibling(tree.postorderselect(child));
                    numChildren++;
                }
                angle[i] = angleSum / numChildren;
            }
        }

        // Iterate over the tree in preorder, assigning radii
        // (The "i = 2" skips the root of the tree; its radius is implicitly 0)
        for (i = 2; i <= tree.size; i++) {
            // Get the postorder position of this node, which we'll use when
            // writing to the radius array (which is stored in postorder, as
            // are the remainder of the "result" arrays defined above)
            var node = tree.postorder(tree.preorderselect(i));
            var parent = tree.postorder(tree.parent(tree.preorderselect(i)));
            if (ignoreLengths) {
                radius[node] = radius[parent] + 1;
            } else {
                radius[node] = radius[parent] + tree.length(tree.preorderselect(i));
            }
        }

        // Now that we have the polar coordinates of the nodes, convert them to
        // normal x/y coordinates (a.k.a. Cartesian coordinates).
        // We skip the root because we already know it's going to be at (0, 0).
        //
        // Unlike the rectangular / unrooted layout we need to keep track of
        // two sets of positions for each (non-root) node: a "starting" and
        // "end" point. In the other layouts we can just infer the starting
        // point during drawing, but here each node's line begins at its parent
        // node's radius but at its own angle in polar coordinates -- and to
        // avoid doing extra work on converting between polar and Cartesian
        // coords, we just compute both points here. (As a potential TODO, it's
        // probably possible to do this more efficiently.)
        for (i = 1; i < tree.size; i++) {
            // To avoid repeated lookups / computations, store a few things in
            // memory during this iteration of the loop
            var parentRadius =
                radius[tree.postorder(tree.parent(tree.postorderselect(i)))];
            var currAngle = angle[i];
            currRadius = radius[i];
            // NOTE: due to the inherent inaccuracies of floating-point math
            // (and due to pi being irrational), Math.cos(Math.PI / 2) is
            // __very__ slightly off from zero (so e.g.
            // 2(cos(pi/2)) != 1(cos(pi/2)), even though ideally both sides of
            // that equation would be 0). This shouldn't really impact
            // anything, but it was a problem in the past when we were
            // determining the "min and max" x/y coordinates for scaling
            // (which has since been removed). Just something to keep in mind.
            // (See https://stackoverflow.com/q/8050722/10730311 for details.)
            var angleCos = Math.cos(currAngle);
            var angleSin = Math.sin(currAngle);
            // Assign starting points
            x0[i] = parentRadius * angleCos;
            y0[i] = parentRadius * angleSin;
            // Assign ending points
            x1[i] = currRadius * angleCos;
            y1[i] = currRadius * angleSin;
        }

        // Go over the tree (in postorder, but order doesn't really matter
        // for this) to determine arc positions for non-root internal nodes.
        // I think determining arc positions could be included in the above for
        // loop...
        for (i = 1; i < tree.size; i++) {
            // Compute arcs for non-root internal nodes (we know that this node
            // isn't the root because we're skipping the root entirely in this
            // for loop)
            if (!tree.isleaf(tree.postorderselect(i))) {
                // Find the biggest and smallest angle of the node's children
                var biggestChildAngle = Number.NEGATIVE_INFINITY;
                var smallestChildAngle = Number.POSITIVE_INFINITY;
                child = tree.fchild(tree.postorderselect(i));
                while (child !== 0) {
                    child = tree.postorder(child);
                    var childAngle = angle[child];
                    if (childAngle > biggestChildAngle) {
                        biggestChildAngle = childAngle;
                    }
                    if (childAngle < smallestChildAngle) {
                        smallestChildAngle = childAngle;
                    }
                    child = tree.nsibling(tree.postorderselect(child));
                }
                // Position the arc start point at the biggest child angle
                // position
                currRadius = radius[i];
                arcx0[i] = currRadius * Math.cos(biggestChildAngle);
                arcy0[i] = currRadius * Math.sin(biggestChildAngle);
                arcStartAngle[i] = biggestChildAngle;
                arcEndAngle[i] = smallestChildAngle;
            }
        }

        // We don't need to reposition coordinates relative to the root because
        // the root is already at (0, 0) :)

        return {
            x0: x0,
            y0: y0,
            x1: x1,
            y1: y1,
            angle: angle,
            arcx0: arcx0,
            arcy0: arcy0,
            arcStartAngle: arcStartAngle,
            arcEndAngle: arcEndAngle,
        };
    }

    function unrootedLayout(tree, width, height) {
        var angle = (2 * Math.PI) / tree.numleaves();
        var x1Arr = new Array(tree.size + 1);
        var x2Arr = new Array(tree.size + 1);
        var y1Arr = new Array(tree.size + 1);
        var y2Arr = new Array(tree.size + 1);
        var aArr = new Array(tree.size + 1);

        var n = tree.postorderselect(tree.size);
        var x1 = 0,
            y1 = 0,
            a = 0,
            da = angle;
        var x2 = x1 + tree.length(n) * Math.sin(a);
        var y2 = y1 + tree.length(n) * Math.cos(a);
        x1Arr[tree.size] = x1;
        x2Arr[tree.size] = x2;
        y1Arr[tree.size] = y1;
        y2Arr[tree.size] = y2;
        aArr[tree.size] = a;

        // reverse postorder
        for (var node = tree.size - 1; node > 0; node--) {
            var parent = tree.postorder(
                tree.parent(tree.postorderselect(node))
            );
            x1 = x2Arr[parent];
            y1 = y2Arr[parent];
            a = aArr[parent] - (tree.getNumTips(parent) * da) / 2;
            var sib = tree.postorder(tree.fchild(tree.postorderselect(parent)));
            while (sib !== node) {
                a += tree.getNumTips(sib) * da;
                sib = tree.postorder(tree.nsibling(tree.postorderselect(sib)));
            }
            a += (tree.getNumTips(node) * da) / 2;

            n = tree.postorderselect(node);
            x2 = x1 + tree.length(n) * Math.sin(a);
            y2 = y1 + tree.length(n) * Math.cos(a);
            x1Arr[node] = x1;
            x2Arr[node] = x2;
            y1Arr[node] = y1;
            y2Arr[node] = y2;
            aArr[node] = a;
        }

        centerAtRoot(x2Arr, y2Arr);

        return { xCoord: x2Arr, yCoord: y2Arr };
    }

    return {
        rectangularLayout: rectangularLayout,
        circularLayout: circularLayout,
        unrootedLayout: unrootedLayout,
    };
});