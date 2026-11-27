"""The rigged cape: a cloak cut and hung once on the body standing, then worn on its bones as armour is.

Its yoke, the rows over the shoulders, is skinned to the neck, the chest and the collarbones (a little to the upper
arms), so a shrug lifts it and nothing re-lays it from frame to frame. The cloth below swings on a few chains of
links down from the yoke's foot: each link a weighted pendulum under gravity (turned with the chest as cloth.py
`_held` turns it) and in the air the body moves through, the chains held a cloth's width apart, and every link kept
off a handful of capsules round the body's bones - its trunk, its hips, its arms and its legs - and off the floor.
The cloth between the chains follows them as a skin follows bones, its folds its own as it was hung.

Nothing is read off the skin while it swings: a capsule's inside is never in doubt, so a fast limb can push the
cloth but never tear it through the body. The swing is carried in the chest, so a body turned or set down elsewhere
from key to key never throws it, and one swing serves every view of a move: the same cape from every side."""
import math

import numpy as np
from scipy.spatial.transform import Rotation

import rig

VERSION = 1            # raised whenever the rig hangs a cloak differently: every cloak's strips drawn again
CHAINS = 11           # the chains across the cloth, its two front edges among them
LINKS = 5              # the links of each, from the yoke's foot to the hem
STEP = 1.0 / 120       # seconds a step of the swing
DRAG = 2.0             # the air's hold on the cloth: its speed through the air lost this share a second
HOLD = 1.0             # how hard the cloth is drawn back to the shape it hung in, as a share of gravity's pull on a
LEVER_MIN = 0.1        # pendulum as long as the cloth above each point (no shorter than this, metres)
SLIM = 0.30            # the share of its width round the body the cloth keeps below the shoulders
SLIM_FROM = 6          # the row it leaves the shoulders' tops by, a hood's mantle sewn there (drape.py `MANTLE`)
TAPER = 0.3            # the share of the way down from there over which it draws in to `SLIM`
DAMP = 4.0             # its own swing lost this share a second
SETTLE = 1.0           # seconds it hangs at the first key before the move begins
REST = 0.25            # seconds it comes to rest at each key, so a frame shows it hanging, never thrown
CYCLES = 2             # a move that goes round is carried round this many times, the last drawn
ITERS = 8              # the passes a step puts its lengths and its capsules right
EASE = 0.012           # how far it lies off a capsule
# where drape.PACE has none: seconds a key, whether it goes round, and the air the body meets (metres a second)
PACE = {'run': (0.15, True, 2.5), 'gunrun': (0.15, True, 2.5), 'bowrun': (0.15, True, 2.5),
        'bracerun': (0.15, True, 2.5), 'pistolrun': (0.15, True, 2.5), 'crouch_walk': (0.24, True, 0.6)}
# the bones the yoke is worn on, each from its joint to the next, and how firmly
YOKE = (('neck', 'head', 1.0), ('chest', 'neck', 1.0), ('clav_L', 'uarm_L', 1.0), ('clav_R', 'uarm_R', 1.0),
        ('uarm_L', 'farm_L', 0.3), ('uarm_R', 'farm_R', 0.3))
YOKE_REACH = 0.06      # metres: a bone's hold on the yoke falls away over about this
# the capsules it is kept off: the trunk it lies on (each made no fatter than lets it lie as it was hung), and the
# limbs that swing into it
TRUNK = (('pelvis', 'spine'), ('spine', 'chest'), ('chest', 'neck'), ('thigh_L', 'thigh_R'))
LIMBS = (('uarm_L', 'farm_L'), ('uarm_R', 'farm_R'), ('farm_L', 'hand_L'), ('farm_R', 'hand_R'),
         ('thigh_L', 'shin_L'), ('thigh_R', 'shin_R'), ('shin_L', 'foot_L'), ('shin_R', 'foot_R'))


HORSE_REACH = 0.8      # metres round the seat the horse's barrel and rump are fitted from


def horse(P, seat):
    """A horse's barrel and rump as one capsule (its ends, its radius), from its hide's and saddle's points `P`
    (drape.py `horse_points`) within `HORSE_REACH` of the rider's `seat`: along the way they run longest, as fat as
    the hide round the middle of that, so a cloak falls over the rump as it falls over the saddle."""
    P = np.asarray(P, float)
    near = P[np.linalg.norm(P - np.asarray(seat, float), axis=1) < HORSE_REACH]
    c = near.mean(axis=0)
    ax = np.linalg.svd(near - c, full_matrices=False)[2][0]
    t = (near - c) @ ax
    lo, hi = np.percentile(t, [5, 95])
    mid = (t > lo + 0.25 * (hi - lo)) & (t < hi - 0.25 * (hi - lo))
    r = float(np.percentile(np.linalg.norm((near - c) - np.outer(t, ax), axis=1)[mid], 60))
    return c + ax * (lo + 0.5 * r), c + ax * (hi - 0.5 * r), r


def _mats(W):
    return {j: np.array(m, float) for j, m in W.items()}


def _unit(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)


class _Pose:
    """A key's joints as the rig composes them, each its own turn and place on its parent, to be blended."""

    def __init__(self, W):
        self.joints = [j for j in rig.ORDER if j in W]
        at = {j: i for i, j in enumerate(self.joints)}
        self.parent = [at.get(rig.JOINTS[j][0], -1) for j in self.joints]
        L = [W[j] if rig.JOINTS[j][0] not in W else np.linalg.solve(W[rig.JOINTS[j][0]], W[j]) for j in self.joints]
        self.q = Rotation.from_matrix(np.array([m[:3, :3] for m in L])).as_quat()
        self.t = np.array([m[:3, 3] for m in L])

    def blend(self, other, u):
        """The joints `u` of the way to `other`'s: each turn slerped, each place lerped, composed down the tree."""
        qa, qb = self.q, other.q.copy()
        d = (qa * qb).sum(axis=1)
        qb[d < 0] *= -1
        d = np.clip(np.abs(d), -1.0, 1.0)
        th = np.arccos(d)
        s = np.sin(th)
        small = s < 1e-6
        wa = np.where(small, 1 - u, np.sin((1 - u) * th) / np.where(small, 1, s))
        wb = np.where(small, u, np.sin(u * th) / np.where(small, 1, s))
        q = _unit(wa[:, None] * qa + wb[:, None] * qb)
        R = Rotation.from_quat(q).as_matrix()
        t = self.t + (other.t - self.t) * u
        out = {}
        M = [None] * len(self.joints)
        for i, j in enumerate(self.joints):
            m = np.eye(4)
            m[:3, :3], m[:3, 3] = R[i], t[i]
            M[i] = m if self.parent[i] < 0 else M[self.parent[i]] @ m
            out[j] = M[i]
        return out


def _turn(a, b):
    """The turn taking the way `a` to the way `b`, the shortest."""
    a, b = a / np.linalg.norm(a), b / np.linalg.norm(b)
    v, c = np.cross(a, b), float(a @ b)
    if c < -0.9999:   # turned right over: about any way across
        axis = np.cross(a, [1.0, 0.0, 0.0] if abs(a[0]) < 0.9 else [0.0, 1.0, 0.0])
        return Rotation.from_rotvec(math.pi * axis / np.linalg.norm(axis)).as_matrix()
    K = np.array([[0.0, -v[2], v[1]], [v[2], 0.0, -v[0]], [-v[1], v[0], 0.0]])
    return np.eye(3) + K + K @ K / (1.0 + c)


def _closest(X, A, B):
    """The nearest point to each of `X` on the segment from `A` to `B`."""
    ab = B - A
    t = np.clip(((X - A) @ ab) / max(ab @ ab, 1e-12), 0.0, 1.0)
    return A + t[:, None] * ab


def _slim(G):
    """The cloth below the shoulders drawn in toward the back's middle: each row laid along its own course as it
    hung, but over only `SLIM` of it, the share falling from the whole at row `SLIM_FROM` (where the cloth leaves the
    shoulders' tops, and a hood's mantle is sewn) over the first `TAPER` of the way down from there, so the shoulders
    wear it as they did and below them it hangs slim down the back."""
    G = G.copy()
    cols = G.shape[1]
    mid = (cols - 1) / 2   # the back's middle: the cloak runs round from one front edge to the other
    rows = np.arange(SLIM_FROM + 1, G.shape[0])
    u = (rows - SLIM_FROM) / max(G.shape[0] - 1 - SLIM_FROM, 1)
    w = np.clip(u / TAPER, 0.0, 1.0)
    share = 1 - (1 - SLIM) * w * w * (3 - 2 * w)
    for r, s in zip(rows, share):
        at = mid + (np.arange(cols) - mid) * s
        lo = np.clip(np.floor(at).astype(int), 0, cols - 2)
        f = (at - lo)[:, None]
        G[r] = G[r, lo] * (1 - f) + G[r, lo + 1] * f
    return G


def _frames(X):
    """Each chain point's frame (chains, points, 3, 3): down the chain, across to its neighbours, and out."""
    d = np.gradient(X, axis=1)
    e = np.gradient(X, axis=0)
    d = _unit(d)
    e = _unit(e - d * (e * d).sum(axis=-1, keepdims=True))
    return np.stack([d, e, np.cross(d, e)], axis=-1)


class Rig:
    """A cloak's rig, made from its grid `G0` (rows, cols, 3) as it hung on the body standing (joints `W0`, its
    surfaces `P` there, the yoke its first `yoke` rows)."""

    def __init__(self, G0, W0, P, yoke):
        W0 = _mats(W0)
        self.rows, self.cols, self.k = G0.shape[0], G0.shape[1], yoke
        inv = np.linalg.inv(W0['chest'])
        local = lambda X: X @ inv[:3, :3].T + inv[:3, 3]   # noqa: E731
        G0 = _slim(np.asarray(G0, float))   # the cut as worn: slim below the shoulders, its yoke too
        G = local(G0.reshape(-1, 3)).reshape(G0.shape)
        # the yoke, worn on its bones: each point's place on each bone, and the bone's hold on it
        Y = G0[:yoke].reshape(-1, 3)
        hold = []
        self.on = []
        for a, b, firm in YOKE:
            A, B = W0[a][:3, 3], W0[b][:3, 3]
            dist = np.linalg.norm(Y - _closest(Y, A, B), axis=1)
            hold.append(firm * np.exp(-(dist / YOKE_REACH) ** 2) + 1e-9)
            self.on.append(np.linalg.solve(W0[a], np.c_[Y, np.ones(len(Y))].T).T)
        hold = np.array(hold).T
        self.hold = hold / hold.sum(axis=1, keepdims=True)
        # the chains: their columns, and the rows their points lie on, the first the yoke's foot
        self.ck = np.unique(np.round(np.linspace(0, self.cols - 1, CHAINS)).astype(int))
        self.rl = np.unique(np.round(np.linspace(yoke - 1, self.rows - 1, LINKS + 1)).astype(int))
        self.P0 = G[self.rl][:, self.ck].transpose(1, 0, 2)   # (chains, points, 3)
        self.F0 = _frames(self.P0)
        self.down = np.linalg.norm(np.diff(self.P0, axis=1), axis=2)
        self.across = np.linalg.norm(np.diff(self.P0, axis=0), axis=2)
        self.bend = np.linalg.norm(self.P0[:, 2:] - self.P0[:, :-2], axis=2)
        # the cloth below the yoke's foot, worn on the chains' points: each the four round it, as they lay
        rows = np.arange(yoke - 1, self.rows)
        li = np.clip(np.searchsorted(self.rl, rows, 'right') - 1, 0, len(self.rl) - 2)
        lb = (rows - self.rl[li]) / (self.rl[li + 1] - self.rl[li])
        cols = np.arange(self.cols)
        ci = np.clip(np.searchsorted(self.ck, cols, 'right') - 1, 0, len(self.ck) - 2)
        ca = (cols - self.ck[ci]) / (self.ck[ci + 1] - self.ck[ci])
        V0 = G[yoke - 1:]
        corners, weights, offsets = [], [], []
        for dl, wl in ((0, 1 - lb), (1, lb)):
            for dc, wc in ((0, 1 - ca), (1, ca)):
                kk = np.broadcast_to(ci + dc, (len(rows), self.cols))
                ll = np.broadcast_to((li + dl)[:, None], (len(rows), self.cols))
                corners.append((kk, ll))
                weights.append(wl[:, None] * wc[None, :])
                rel = V0 - self.P0[kk, ll]
                offsets.append(np.einsum('rcji,rcj->rci', self.F0[kk, ll], rel))
        self.corners, self.weights, self.offsets = corners, np.array(weights), offsets
        # the capsules, each as fat as the surfaces round the middle of its bone (where no other part is near), and
        # none fatter than lets the cloth lie as it was hung: standing, nothing pushes it
        PL = local(np.asarray(P, float))
        segs = [(a, b, local(W0[a][:3, 3][None])[0], local(W0[b][:3, 3][None])[0]) for a, b in TRUNK + LIMBS]
        dists, along = [], []
        for _, _, A, B in segs:
            ab = B - A
            t = ((PL - A) @ ab) / max(ab @ ab, 1e-12)
            along.append(t)
            dists.append(np.linalg.norm(PL - (A + np.clip(t, 0, 1)[:, None] * ab), axis=1))
        dists, along = np.array(dists), np.array(along)
        near = np.argmin(dists, axis=0)
        cloth = G[yoke:].reshape(-1, 3)
        self.caps = []
        for i, (a, b, A, B) in enumerate(segs):
            mine = dists[i][(near == i) & (dists[i] < 0.3) & (along[i] > 0.15) & (along[i] < 0.85)]
            r = float(np.percentile(mine, 60)) if len(mine) > 20 else 0.04
            clear = float(np.percentile(np.linalg.norm(cloth - _closest(cloth, A, B), axis=1), 0.5)) - 0.5 * EASE
            self.caps.append((a, b, max(min(r, clear), 0.02)))
        self.kept, self.travel = {}, 0.0
        self.down0 = self._down(W0)   # the way down it was hung in
        # each point's pull back to where it hung: as gravity's on a pendulum as long as the cloth above it, so the
        # cloth near the yoke keeps its shape and a long cloak's hem swings and blows as cloth does
        lever = np.concatenate([np.zeros((len(self.ck), 1)), np.cumsum(self.down, axis=1)], axis=1)
        self.hold_back = HOLD * 9.81 / np.maximum(lever, LEVER_MIN)

    @staticmethod
    def _down(W):
        """The way down in the chest's frame: the world's while the body stands, its own while it lies (drape.py
        `Frame`), so a cloak hangs down a standing body and along a fallen one."""
        import drape
        return W['chest'][:3, :3].T @ -drape.Frame(W).up

    def _at(self, W, extra=()):
        """What the cloth hangs from and in, the joints `W` as they stand: in the chest's frame, the yoke's foot at
        the chains' columns, the capsules (the body's, and `extra` ones in the world, a horse's), the air, the floor,
        and where each chain's points would hang as hung: from the yoke's foot where it is now, turned as the way down
        has turned since it was hung."""
        Mc = np.linalg.inv(W['chest'])
        pins = self._yoke(W, Mc, self.ck)
        caps = [((Mc @ np.r_[W[a][:3, 3], 1])[:3], (Mc @ np.r_[W[b][:3, 3], 1])[:3], r) for a, b, r in self.caps]
        caps += [((Mc @ np.r_[A, 1])[:3], (Mc @ np.r_[B, 1])[:3], r) for A, B, r in extra]
        R = W['chest'][:3, :3]
        import drape
        air = R.T @ (drape.Frame(W).y * self.travel)
        floor = (R[2], 0.005 - W['chest'][2, 3])   # a point x lies above the floor where floor[0] @ x >= floor[1]
        turn = _turn(self.down0, self._down(W))
        hung = pins[:, None] + (self.P0 - self.P0[:, :1]) @ turn.T
        return pins, caps, None, air, floor, hung

    def _yoke(self, W, Mc, cols=None):
        """The yoke as worn on its bones (in the chest's frame): all of it, or its foot at `cols`."""
        if cols is None:
            pick = slice(None)
        else:
            pick = (self.k - 1) * self.cols + np.asarray(cols)
        out = 0.0
        for (a, _, _), on, h in zip(YOKE, self.on, self.hold.T):
            out = out + h[pick, None] * ((Mc @ W[a]) @ on[pick].T).T[:, :3]
        return out

    def _step(self, X, Xp, at, damp):
        """A step of the swing: each point drawn back toward where it lay as hung, swung by gravity's turn away from
        the gravity it was hung in and by the air; then its lengths, its spread and the capsules put right."""
        pins, caps, _, air, (fn, fd), hung = at
        v = (X - Xp) / STEP
        acc = self.hold_back[..., None] * (hung - X) + DRAG * (air - v)
        Xn = X + (X - Xp) * math.exp(-damp * STEP) + acc * STEP * STEP
        for _ in range(ITERS):
            Xn[:, 0] = pins
            for l in range(Xn.shape[1] - 1):   # down each chain, its links as long as they were
                d = Xn[:, l + 1] - Xn[:, l]
                n = np.linalg.norm(d, axis=1, keepdims=True)
                c = d * (1 - self.down[:, l:l + 1] / np.maximum(n, 1e-9))
                if l == 0:
                    Xn[:, 1] -= c
                else:
                    Xn[:, l] += 0.5 * c
                    Xn[:, l + 1] -= 0.5 * c
            b = Xn[:, 2:] - Xn[:, :-2]   # never folded back on itself
            n = np.linalg.norm(b, axis=2, keepdims=True)
            lo = 0.7 * self.bend[..., None]
            push = np.where(n < lo, b * (1 - lo / np.maximum(n, 1e-9)), 0.0)
            Xn[:, 2:] -= 0.5 * push
            Xn[:, :-2] += np.where(np.arange(Xn.shape[1] - 2)[None, :, None] == 0, 0.0, 0.5 * push)
            a = Xn[1:, 1:] - Xn[:-1, 1:]   # the chains a cloth's width apart: never further, never all gathered
            n = np.linalg.norm(a, axis=2, keepdims=True)
            hi, lo = 1.03 * self.across[:, 1:, None], 0.35 * self.across[:, 1:, None]
            fix = np.where(n > hi, a * (1 - hi / np.maximum(n, 1e-9)), np.where(n < lo, a * (1 - lo / np.maximum(n, 1e-9)), 0.0))
            Xn[:-1, 1:] += 0.5 * fix
            Xn[1:, 1:] -= 0.5 * fix
            free = Xn[:, 1:].reshape(-1, 3)
            for A, B, r in caps:
                c = _closest(free, A, B)
                d = free - c
                n = np.linalg.norm(d, axis=1, keepdims=True)
                inside = n[:, 0] < r + EASE
                free[inside] = c[inside] + d[inside] / np.maximum(n[inside], 1e-9) * (r + EASE)
            below = free @ fn < fd
            free[below] += np.outer(fd - free[below] @ fn, fn)
            Xn[:, 1:] = free.reshape(Xn[:, 1:].shape)
        Xn[:, 0] = pins
        return Xn, X

    def swing(self, anim, Ws, pace, extras=None):
        """The cloth carried through a move's keys (`Ws`, each its joints, and `extras` each key's capsules in the
        world besides the body's: a horse's) at `pace` (seconds a key, whether it goes round, the air it meets): the
        chains' points at each key, in the chest's frame. One swing a move: the same joints and capsules, in the
        chest's frame, give the same swing, whichever view they were posed for."""
        keys = [_mats(W) for W in Ws]
        n = len(keys)
        extras = [list(e or ()) for e in (extras or [()] * n)]

        def chest(K, e):
            M = np.linalg.inv(K['chest'])
            parts = [(M @ K[j])[:3].ravel() for j in rig.ORDER if j in K]
            parts += [np.r_[(M @ np.r_[A, 1])[:3], (M @ np.r_[B, 1])[:3], r] for A, B, r in e]
            return (np.round(np.concatenate(parts), 3) + 0.0).tobytes()   # + 0.0: -0.0 and 0.0 are the same

        sign = (anim, tuple(chest(K, e) for K, e in zip(keys, extras)))
        if sign in self.kept:
            return self.kept[sign]
        per_key, loop, self.travel = PACE.get(anim, pace)
        loop = loop and n > 1
        at0 = self._at(keys[0], extras[0])
        X = self.P0 + (at0[0] - self.P0[:, 0])[:, None]
        Xp = X.copy()
        for _ in range(int(SETTLE / STEP)):
            X, Xp = self._step(X, Xp, at0, DAMP * 3)
        out = [None] * n
        out[0] = X.copy()
        poses = [_Pose(K) for K in keys]
        legs = [(k, (k + 1) % n) for k in range(n)] * CYCLES if loop else [(k, k + 1) for k in range(n - 1)]
        steps = max(1, round(per_key / STEP))
        for leg, (a, b) in enumerate(legs):
            for s in range(1, steps + 1):
                u = s / steps
                ea, eb = extras[a], extras[b]
                e = ([(A + (A2 - A) * u, B + (B2 - B) * u, r + (r2 - r) * u)
                      for (A, B, r), (A2, B2, r2) in zip(ea, eb)] if len(ea) == len(eb) else ea)
                X, Xp = self._step(X, Xp, self._at(poses[a].blend(poses[b], u), e), DAMP)
            atb = self._at(keys[b], extras[b])
            for _ in range(int(REST / STEP)):
                X, Xp = self._step(X, Xp, atb, DAMP * 3)
            if not loop or leg >= len(legs) - n:
                out[b] = X.copy()
        self.kept[sign] = out
        return out

    def grid(self, X, W, extra=()):
        """The cloak's grid (rows, cols, 3) in the world, its chains' points `X` as they hang with the joints `W`
        (and `extra` capsules in the world)."""
        W = _mats(W)
        Mc = np.linalg.inv(W['chest'])
        G = np.zeros((self.rows, self.cols, 3))
        G[:self.k] = self._yoke(W, Mc).reshape(self.k, self.cols, 3)
        F = _frames(X)
        panel = 0.0
        for (kk, ll), w, o in zip(self.corners, self.weights, self.offsets):
            panel = panel + w[..., None] * (X[kk, ll] + np.einsum('rcij,rcj->rci', F[kk, ll], o))
        panel[0] = G[self.k - 1]   # the yoke's foot as the yoke wears it
        flat = panel[1:].reshape(-1, 3)
        _, caps, _, _, (fn, fd), _ = self._at(W, extra)
        for A, B, r in caps:   # every point of it, not the chains' alone, kept off the capsules
            c = _closest(flat, A, B)
            d = flat - c
            n = np.linalg.norm(d, axis=1, keepdims=True)
            inside = n[:, 0] < r + 0.5 * EASE
            flat[inside] = c[inside] + d[inside] / np.maximum(n[inside], 1e-9) * (r + 0.5 * EASE)
        below = flat @ fn < fd
        flat[below] += np.outer(fd - flat[below] @ fn, fn)
        panel[1:] = flat.reshape(panel[1:].shape)
        G[self.k - 1:] = panel
        Wc = W['chest']
        return G @ Wc[:3, :3].T + Wc[:3, 3]
