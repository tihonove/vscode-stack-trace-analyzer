namespace SampleRepo.Tests;

// A second file named Helper.cs, used to exercise suffix disambiguation:
// a frame like "Utils/Helper.cs" must prefer src/Utils/Helper.cs over this one.
public class HelperTests
{
    public bool Passes() => true;
}
