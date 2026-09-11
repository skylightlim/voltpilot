import sys
sys.path.insert(0, ".")

PROFILE_A = {  # no budget cap: used for collinearity, rank reversal, score gaps
    "language": "en", "daily_km": 40, "trips_per_week": 5,
    "long_trip_frequency": "monthly", "long_trip_km": 300,
    "destination_region": "north", "can_charge_home": True,
    "home_postcode": "50400", "consider_solar": False, "budget_max_rm": 0,
    "grid_region": "peninsular", "monthly_electricity_bill_rm": 0,
}
PROFILE_B = dict(PROFILE_A, budget_max_rm=250_000)  # method and jitter tests
SLIDERS = {"save_money": 50, "environment": 50, "convenience": 50, "future_proofing": 50}
