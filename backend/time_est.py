import pandas as pd
from sklearn.linear_model import LinearRegression


class DurationEstimator:
    def __init__(self):
        # user_id -> model bundle
        self.cache = {}
        self.global_model = None
        self.global_avg = 2.0

    # -------------------------
    # DB helpers
    # -------------------------
    def _get_completed_count(self, conn, user_id):
        return conn.execute("""
            SELECT COUNT(*)
            FROM services
            WHERE user_id = ?
              AND completed = 1
              AND duration_hours IS NOT NULL
        """, (user_id,)).fetchone()[0]

    def _get_avg_duration(self, conn, user_id):
        avg = conn.execute("""
            SELECT AVG(duration_hours)
            FROM services
            WHERE user_id = ?
              AND completed = 1
              AND duration_hours IS NOT NULL
        """, (user_id,)).fetchone()[0]

        return float(avg) if avg is not None else 2.0

    # -------------------------
    # Training
    # -------------------------
    def _train_user(self, conn, user_id):
        df = pd.read_sql_query("""
            SELECT
                q.windows,
                LOWER(s.type) AS type,
                s.duration_hours
            FROM services s
            JOIN quotes q ON s.quote_id = q.id
            WHERE s.user_id = ?
            AND s.completed = 1
            AND s.duration_hours IS NOT NULL
            AND q.windows IS NOT NULL
        """, conn, params=(user_id,))

        if len(df) < 10:
            return None

        df = pd.get_dummies(df, columns=["type"])

        X = df.drop(columns=["duration_hours"])
        y = df["duration_hours"]

        model = LinearRegression()
        model.fit(X, y)

        return model, X.columns.tolist()

    def _train_global(self, conn):
        df = pd.read_sql_query("""
            SELECT
                q.windows,
                s.duration_hours
            FROM services s
            JOIN quotes q ON s.quote_id = q.id
            WHERE s.completed = 1
            AND s.duration_hours IS NOT NULL
            AND q.windows IS NOT NULL
        """, conn)

        if len(df) < 10:
            return None

        X = df[["windows"]]
        y = df["duration_hours"]

        model = LinearRegression()
        model.fit(X, y)

        self.global_avg = float(y.mean())

        return model
    
    def _ensure_global(self, conn):
        if self.global_model is None:
            self.global_model = self._train_global(conn)
    
    # -------------------------
    # Cache loader
    # -------------------------
    def _ensure_user_loaded(self, conn, user_id):
        if user_id is None:
            return

        self._ensure_global(conn)

        current_count = conn.execute("""
            SELECT COUNT(*)
            FROM services
            WHERE user_id = ?
            AND completed = 1
            AND duration_hours IS NOT NULL
        """, (user_id,)).fetchone()[0]

        cached = self.cache.get(user_id)

        if cached and cached["completed_count"] == current_count:
            return

        avg = self.global_avg
        result = self._train_user(conn, user_id)

        if result is None:
            self.cache[user_id] = {
                "model": None,
                "feature_names": None,
                "completed_count": current_count
            }
            return

        model, features = result

        self.cache[user_id] = {
            "model": model,
            "feature_names": features,
            "completed_count": current_count
        }

    # -------------------------
    # Public API
    # -------------------------
    def estimate(self, conn, user_id, windows, service_type):
        self._ensure_user_loaded(conn, user_id)

        cached = self.cache.get(user_id)

        # -----------------------
        # 1. Use user model if available
        # -----------------------
        if cached and cached["model"] is not None:
            model = cached["model"]
            features = cached["feature_names"]

            service_type = (service_type or "").lower()

            row = {"windows": windows}

            for f in features:
                if f != "windows":
                    row[f] = 0

            type_col = f"type_{service_type}"
            if type_col in row:
                row[type_col] = 1

            X = pd.DataFrame([row]).reindex(columns=features, fill_value=0)

            return max(0.5, min(12.0, float(model.predict(X)[0])))

        # -----------------------
        # 2. Fallback: GLOBAL model (windows-only)
        # -----------------------
        if self.global_model is not None:
            return max(
                0.5,
                min(12.0, float(self.global_model.predict([[windows]])[0]))
            )

        # -----------------------
        # 3. Final fallback
        # -----------------------
        return max(0.5, min(12.0, self.global_avg))