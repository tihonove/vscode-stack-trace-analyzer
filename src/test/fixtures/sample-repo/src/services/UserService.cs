namespace SampleRepo.Services;

public class UserService
{
    public string GetName(int id) => $"user-{id}";
}
